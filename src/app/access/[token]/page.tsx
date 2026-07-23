import { notFound } from "next/navigation";
import { getAccessData } from "@/lib/access";
import { AccessView } from "./AccessView";

export const dynamic = "force-dynamic";

export default async function AccessPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await getAccessData(token);
  if (!data) notFound();

  return (
    <main className="flex-1 flex items-center justify-center px-6 py-12">
      <AccessView token={token} initial={data} />
    </main>
  );
}
