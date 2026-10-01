import { getCampusOverview } from "@/lib/campus-data";
import { BuildingNotFoundError } from "@/lib/campus-buildings";

export async function GET(request: Request) {
  try {
    return Response.json(await getCampusOverview(new URL(request.url).searchParams.get("building") || undefined));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Campus data is unavailable.";
    return Response.json({ error: message }, { status: error instanceof BuildingNotFoundError ? 404 : 503 });
  }
}
