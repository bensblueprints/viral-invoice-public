// End-to-end test of the payment webhook -> price advance -> delivery loop.
// Uses a self-signed Stripe event against the REAL webhook route (signature
// verification runs for real; no live Stripe API key needed).
import postgres from "postgres";
import { createCipheriv, randomBytes, createHmac } from "node:crypto";
import { createServer } from "node:http";
import "dotenv/config";

const APP = "http://localhost:3000";
const sql = postgres(process.env.DATABASE_URL);
const ENC_KEY = Buffer.from(process.env.ENCRYPTION_KEY, "base64");
const WHSEC = "whsec_test_" + randomBytes(16).toString("hex");

function encrypt(plaintext) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", ENC_KEY, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${ct.toString("base64")}`;
}

function stripeSig(payload, secret) {
  const t = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", secret)
    .update(`${t}.${payload}`)
    .digest("hex");
  return `t=${t},v1=${sig}`;
}

let pass = 0,
  fail = 0;
function assert(cond, label) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.error(`  ✗ FAIL: ${label}`);
  }
}

// --- Local capture server for the outbound delivery webhook ---
const captured = [];
const capture = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    captured.push({ headers: req.headers, body });
    res.writeHead(200);
    res.end("ok");
  });
});
await new Promise((r) => capture.listen(4111, r));

async function main() {
  // Pick the existing test user.
  const [u] = await sql`select id from "user" order by created_at limit 1`;
  if (!u) throw new Error("No user — run signup first");
  const userId = u.id;

  // Clean slate for this test.
  await sql`delete from payment_accounts where user_id = ${userId}`;

  const accountId = "acct_test_" + randomBytes(6).toString("hex");
  await sql`
    insert into payment_accounts (id, user_id, provider, encrypted_secret_key, key_last4, livemode, encrypted_webhook_secret, status)
    values (${accountId}, ${userId}, 'stripe', ${encrypt("sk_test_fake")}, '1234', false, ${encrypt(WHSEC)}, 'active')
  `;

  const productId = "prod_test_" + randomBytes(6).toString("hex");
  await sql`
    insert into products (id, user_id, name, description, delivery_webhook_url, delivery_email_enabled, access_content)
    values (${productId}, ${userId}, 'Test Course', 'A test product', ${"http://localhost:4111/hook"}, false, ${"SECRET ACCESS LINK: https://example.com/course"})
  `;

  const invoiceId = "inv_test_" + randomBytes(6).toString("hex");
  const slug = "test" + randomBytes(3).toString("hex");
  // base $100, +$1 per batch, batch of 2, cap $103.
  await sql`
    insert into invoices (id, user_id, product_id, slug, title, base_price_cents, increment_cents, batch_size, price_cap_cents, status, paid_count)
    values (${invoiceId}, ${userId}, ${productId}, ${slug}, 'Test Invoice', 10000, 100, 2, 10300, 'active', 0)
  `;

  // Simulate N buyers. With batch 2, cap $103: prices should be
  // 100,100,101,101,102,102,103,103 then sold out (104 > 103).
  const expectedPrices = [100, 100, 101, 101, 102, 102, 103, 103];
  console.log("\nSimulating buyers through the webhook loop:");

  for (let i = 0; i < expectedPrices.length; i++) {
    // Read current price the way the checkout route would.
    const stateRes = await fetch(`${APP}/api/invoices/${slug}/state`);
    const state = await stateRes.json();
    assert(
      state.priceCents === expectedPrices[i] * 100,
      `buyer ${i + 1}: price is $${expectedPrices[i]} (got $${state.priceCents / 100})`,
    );

    // Insert the pending payment (what /api/checkout does).
    const paymentId = "pay_" + randomBytes(8).toString("hex");
    const sessionId = "cs_test_" + randomBytes(10).toString("hex");
    const accessToken = "tok_" + randomBytes(16).toString("hex");
    await sql`
      insert into payments (id, invoice_id, provider, provider_session_id, amount_cents, currency, status, access_token)
      values (${paymentId}, ${invoiceId}, 'stripe', ${sessionId}, ${state.priceCents}, 'usd', 'pending', ${accessToken})
    `;

    // Build + sign the Stripe event and POST to the real webhook route.
    const event = {
      id: "evt_" + randomBytes(8).toString("hex"),
      type: "checkout.session.completed",
      data: {
        object: {
          id: sessionId,
          object: "checkout.session",
          payment_status: "paid",
          amount_total: state.priceCents,
          currency: "usd",
          payment_intent: "pi_" + randomBytes(8).toString("hex"),
          customer_details: { email: `buyer${i + 1}@test.local`, name: `Buyer ${i + 1}` },
          customer_email: `buyer${i + 1}@test.local`,
          metadata: { invoiceId, paymentId },
        },
      },
    };
    const payload = JSON.stringify(event);
    const res = await fetch(`${APP}/api/webhooks/stripe/${accountId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": stripeSig(payload, WHSEC),
      },
      body: payload,
    });
    assert(res.status === 200, `buyer ${i + 1}: webhook accepted (200)`);

    // Payment recorded as completed.
    const [pay] = await sql`select status, buyer_email from payments where id = ${paymentId}`;
    assert(pay.status === "completed", `buyer ${i + 1}: payment marked completed`);

    // Idempotency: replay the same event -> no double count.
    await fetch(`${APP}/api/webhooks/stripe/${accountId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "stripe-signature": stripeSig(payload, WHSEC) },
      body: payload,
    });
  }

  // Final: invoice should be sold_out, paidCount 8.
  const [inv] = await sql`select status, paid_count from invoices where id = ${invoiceId}`;
  assert(inv.paid_count === 8, `paid_count is 8 (got ${inv.paid_count})`);
  assert(inv.status === "sold_out", `invoice flipped to sold_out (got ${inv.status})`);

  // State endpoint should now report sold out.
  const finalState = await (await fetch(`${APP}/api/invoices/${slug}/state`)).json();
  assert(finalState.soldOut === true, "state endpoint reports soldOut");

  // A 9th checkout attempt must be rejected with 409.
  const rejected = await fetch(`${APP}/api/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug }),
  });
  assert(rejected.status === 409, `checkout after sold-out returns 409 (got ${rejected.status})`);

  // Bad signature must be rejected with 400.
  const badSig = await fetch(`${APP}/api/webhooks/stripe/${accountId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "stripe-signature": "t=1,v1=deadbeef" },
    body: JSON.stringify({ hello: "world" }),
  });
  assert(badSig.status === 400, `bad signature returns 400 (got ${badSig.status})`);

  // Give the after() delivery hook a moment, then check captures.
  await new Promise((r) => setTimeout(r, 1500));
  assert(captured.length >= 8, `outbound delivery webhook fired for each buyer (${captured.length}/8)`);
  if (captured.length > 0) {
    const first = JSON.parse(captured[0].body);
    assert(first.event === "payment.completed", "delivery payload event = payment.completed");
    assert(!!first.accessUrl, "delivery payload includes accessUrl");
    assert(!!captured[0].headers["x-signature"], "delivery payload is HMAC-signed (X-Signature)");
  }

  // Delivery jobs should be marked succeeded.
  const [jobStats] = await sql`
    select count(*) filter (where dj.status='succeeded') as ok, count(*) as total
    from delivery_jobs dj join payments p on p.id = dj.payment_id
    where p.invoice_id = ${invoiceId}
  `;
  assert(
    Number(jobStats.ok) === Number(jobStats.total) && Number(jobStats.total) === 8,
    `all 8 delivery jobs succeeded (${jobStats.ok}/${jobStats.total})`,
  );

  console.log(`\n${pass} passed, ${fail} failed`);
}

try {
  await main();
} finally {
  capture.close();
  await sql.end();
}
process.exit(fail === 0 ? 0 : 1);
