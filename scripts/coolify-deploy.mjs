// One-shot deployment orchestrator for viralinvoice.onetimesuite.com.
// Idempotent: safe to re-run. Reads secrets from the session scratchpad
// (never committed). Steps: GitHub deploy key -> Coolify Postgres -> app ->
// env vars -> domain -> deploy.
import { readFileSync } from "node:fs";

const SECRETS_PATH =
  "/private/tmp/claude-501/-Users-benji/5bc18a59-5e4c-49f8-bdda-f8a8e7a4dee9/scratchpad/deploy-secrets.json";
const S = JSON.parse(readFileSync(SECRETS_PATH, "utf8"));

const ch = (p, opts = {}) =>
  fetch(`${S.COOLIFY_BASE}${p}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${S.COOLIFY_TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(opts.headers || {}),
    },
  });

async function chJson(p, opts) {
  const r = await ch(p, opts);
  const t = await r.text();
  let j = null;
  try {
    j = t ? JSON.parse(t) : null;
  } catch {
    j = { _raw: t.slice(0, 400) };
  }
  return { status: r.status, ok: r.ok, body: j };
}

function log(...a) {
  console.log(...a);
}

async function step1_deployKey() {
  log("\n=== 1. GitHub deploy key ===");
  const pubkey = readFileSync(S.PUBKEY_PATH, "utf8").trim();
  const ghHeaders = {
    Authorization: `Bearer ${S.GH_PAT}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  // Idempotency: skip if a key with this title already exists.
  const existing = await fetch(
    `https://api.github.com/repos/${S.GH_REPO}/keys`,
    { headers: ghHeaders },
  ).then((r) => r.json());
  if (Array.isArray(existing) && existing.some((k) => k.title === "coolify-deploy")) {
    log("  deploy key already present — skipping");
    return;
  }
  const r = await fetch(`https://api.github.com/repos/${S.GH_REPO}/keys`, {
    method: "POST",
    headers: { ...ghHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "coolify-deploy",
      key: pubkey,
      read_only: true,
    }),
  });
  const j = await r.json();
  if (r.status === 201) log("  deploy key added, id", j.id);
  else log("  deploy key resp", r.status, JSON.stringify(j).slice(0, 300));
}

async function step2_postgres() {
  log("\n=== 2. Postgres database ===");
  // Idempotency: reuse an existing db named viral-invoice-db in this project.
  const list = await chJson("/databases");
  let db =
    Array.isArray(list.body) &&
    list.body.find((d) => d.name === "viral-invoice-db");
  if (db) {
    log("  reusing existing db", db.uuid);
  } else {
    const created = await chJson("/databases/postgresql", {
      method: "POST",
      body: JSON.stringify({
        project_uuid: S.PROJECT_UUID,
        server_uuid: S.SERVER_UUID,
        environment_name: "production",
        name: "viral-invoice-db",
        postgres_user: "viral",
        postgres_password: "viral_" + S.ENV.CRON_SECRET.slice(0, 16),
        postgres_db: "viral_invoice",
        instant_deploy: true,
      }),
    });
    log("  create db:", created.status, JSON.stringify(created.body).slice(0, 300));
    const uuid = created.body?.uuid;
    if (!uuid) throw new Error("Postgres creation returned no uuid");
    db = { uuid };
  }
  // Fetch full record for the internal connection URL.
  const full = await chJson(`/databases/${db.uuid}`);
  const rec = full.body || {};
  const internal =
    rec.internal_db_url ||
    rec.postgres_url ||
    `postgresql://${rec.postgres_user || "viral"}:${rec.postgres_password || ""}@${db.uuid}:5432/${rec.postgres_db || "viral_invoice"}`;
  log("  internal DATABASE_URL host derived");
  return internal;
}

async function step3_app() {
  log("\n=== 3. Application ===");
  // Idempotency: reuse existing app with our repo in this project.
  const apps = await chJson("/applications");
  let app =
    Array.isArray(apps.body) &&
    apps.body.find(
      (a) =>
        (a.git_repository || "").includes("viral-invoice") &&
        a.name === "viral-invoice",
    );
  if (app) {
    log("  reusing existing app", app.uuid);
    return app.uuid;
  }
  const created = await chJson("/applications/private-deploy-key", {
    method: "POST",
    body: JSON.stringify({
      project_uuid: S.PROJECT_UUID,
      server_uuid: S.SERVER_UUID,
      environment_name: "production",
      private_key_uuid: S.PRIVATE_KEY_UUID,
      git_repository: S.GIT_REPO_SSH,
      git_branch: S.GIT_BRANCH,
      build_pack: "dockerfile",
      ports_exposes: "3000",
      name: "viral-invoice",
      description: "Escalating-price invoicing SaaS",
      domains: S.DOMAIN,
      instant_deploy: false,
    }),
  });
  log("  create app:", created.status, JSON.stringify(created.body).slice(0, 400));
  const uuid = created.body?.uuid;
  if (!uuid) throw new Error("App creation returned no uuid");
  return uuid;
}

async function step4_env(appUuid, databaseUrl) {
  log("\n=== 4. Environment variables ===");
  const vars = { ...S.ENV, DATABASE_URL: databaseUrl };
  for (const [key, value] of Object.entries(vars)) {
    // Try create; if it exists, update.
    const c = await chJson(`/applications/${appUuid}/envs`, {
      method: "POST",
      body: JSON.stringify({ key, value, is_preview: false }),
    });
    if (c.ok) {
      log(`  set ${key}`);
    } else {
      const u = await chJson(`/applications/${appUuid}/envs`, {
        method: "PATCH",
        body: JSON.stringify({ key, value, is_preview: false }),
      });
      log(`  set ${key} (${u.ok ? "updated" : "err " + u.status})`);
    }
  }
}

async function step5_domainAndDeploy(appUuid) {
  log("\n=== 5. Domain + deploy ===");
  // Ensure domain is set.
  const patch = await chJson(`/applications/${appUuid}`, {
    method: "PATCH",
    body: JSON.stringify({ domains: S.DOMAIN }),
  });
  log("  set domain:", patch.status);
  // Trigger deployment.
  const dep = await chJson(`/deploy?uuid=${appUuid}&force=false`);
  log("  deploy trigger:", dep.status, JSON.stringify(dep.body).slice(0, 300));
  return dep.body;
}

async function main() {
  await step1_deployKey();
  const databaseUrl = await step2_postgres();
  const appUuid = await step3_app();
  await step4_env(appUuid, databaseUrl);
  const dep = await step5_domainAndDeploy(appUuid);

  log("\n=== SUMMARY ===");
  log("  app uuid:", appUuid);
  log("  domain:", S.DOMAIN);
  log("  deployment:", JSON.stringify(dep));
  log(
    "\nNext: watch the build in Coolify. Once green, open",
    S.DOMAIN,
    "\n(DNS for viralinvoice.onetimesuite.com must point at the VPS — see note.)",
  );
}

main().catch((e) => {
  console.error("DEPLOY FAILED:", e.message);
  process.exit(1);
});
