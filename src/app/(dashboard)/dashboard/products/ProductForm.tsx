import Link from "next/link";
import type { Product } from "@/db/schema";

const DEFAULT_SUBJECT = "Your access to {{product}}";
const DEFAULT_BODY =
  "Hi {{name}},\n\nThanks for your purchase of {{product}}! Here's your access link:\n\n{{access_url}}\n\nEnjoy!";

export function ProductForm({
  product,
  action,
}: {
  product?: Product;
  action: (formData: FormData) => void;
}) {
  return (
    <form action={action} className="space-y-6">
      <div className="card space-y-4">
        <div>
          <label className="label" htmlFor="name">
            Product name
          </label>
          <input
            id="name"
            name="name"
            className="input"
            defaultValue={product?.name ?? ""}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="description">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            className="input min-h-20"
            defaultValue={product?.description ?? ""}
          />
        </div>
      </div>

      <div className="card space-y-4">
        <h2 className="font-semibold">Fulfillment</h2>
        <p className="hint">
          What happens when someone pays. All three channels are optional and
          run independently.
        </p>

        <div>
          <label className="label" htmlFor="accessContent">
            Access page content
          </label>
          <textarea
            id="accessContent"
            name="accessContent"
            className="input min-h-24"
            placeholder="The download link, course URL, invite code… shown on the buyer's thank-you page and available as {{access_url}}."
            defaultValue={product?.accessContent ?? ""}
          />
          <p className="hint">
            Revealed on the hosted access page after payment.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="whopCheckoutUrl">
            Whop activation link
          </label>
          <input
            id="whopCheckoutUrl"
            name="whopCheckoutUrl"
            type="url"
            className="input font-mono"
            placeholder="https://whop.com/onetimesuite-complete/…"
            defaultValue={product?.whopCheckoutUrl ?? ""}
          />
          <p className="hint">
            A free ($0) or 100%-off promo checkout link for your Whop product.
            After payment the buyer gets a one-click button to activate it with
            their purchase email pre-filled — granting the membership.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="deliveryWebhookUrl">
            Outbound webhook URL
          </label>
          <input
            id="deliveryWebhookUrl"
            name="deliveryWebhookUrl"
            type="url"
            className="input font-mono"
            placeholder="https://services.leadconnectorhq.com/hooks/…"
            defaultValue={product?.deliveryWebhookUrl ?? ""}
          />
          <p className="hint">
            We POST buyer + payment JSON here (e.g. GoHighLevel), with retries.
          </p>
        </div>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="deliveryEmailEnabled"
            defaultChecked={product?.deliveryEmailEnabled ?? true}
            className="h-4 w-4"
          />
          <span className="text-sm font-medium">Email the buyer an access link</span>
        </label>

        <div>
          <label className="label" htmlFor="deliveryEmailSubject">
            Email subject
          </label>
          <input
            id="deliveryEmailSubject"
            name="deliveryEmailSubject"
            className="input"
            placeholder={DEFAULT_SUBJECT}
            defaultValue={product?.deliveryEmailSubject ?? ""}
          />
        </div>
        <div>
          <label className="label" htmlFor="deliveryEmailBody">
            Email body
          </label>
          <textarea
            id="deliveryEmailBody"
            name="deliveryEmailBody"
            className="input min-h-32"
            placeholder={DEFAULT_BODY}
            defaultValue={product?.deliveryEmailBody ?? ""}
          />
          <p className="hint">
            Placeholders: <code>{"{{name}}"}</code>, <code>{"{{product}}"}</code>
            , <code>{"{{access_url}}"}</code>.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary">
          {product ? "Save changes" : "Create product"}
        </button>
        <Link href="/dashboard/products" className="btn-ghost">
          Cancel
        </Link>
      </div>
    </form>
  );
}
