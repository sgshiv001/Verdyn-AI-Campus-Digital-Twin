import { getCampusOverview } from "@/lib/campus-data";

export async function GET() {
  try {
    return Response.json(await getCampusOverview());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Campus data is unavailable.";
    return Response.json({ error: message }, { status: 503 });
  }
}
