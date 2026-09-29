import { getCampusAnalytics } from "@/lib/campus-data";

export async function GET() {
  try {
    return Response.json(await getCampusAnalytics());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Campus analytics are unavailable.";
    return Response.json({ error: message }, { status: 503 });
  }
}
