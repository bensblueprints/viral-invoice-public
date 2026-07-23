import { NextResponse, type NextRequest } from "next/server";
import { runDueDeliveryJobs } from "@/lib/delivery";
import { env } from "@/lib/env";

/** Retry runner. Point a Coolify scheduled task at this every minute:
 *    curl -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/cron/deliveries
 */
async function handle(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const ran = await runDueDeliveryJobs(50);
  return NextResponse.json({ ran });
}

export const GET = handle;
export const POST = handle;
