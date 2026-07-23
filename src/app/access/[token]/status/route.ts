import { NextResponse } from "next/server";
import { getAccessData } from "@/lib/access";

export async function GET(
  _req: Request,
  ctx: RouteContext<"/access/[token]/status">,
) {
  const { token } = await ctx.params;
  const data = await getAccessData(token);
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(data, {
    headers: { "Cache-Control": "no-store" },
  });
}
