import { activateEfficiencyScenario } from "@/lib/campus-data";
import { BuildingNotFoundError } from "@/lib/campus-buildings";

export async function POST(request: Request) {
  try {
    return Response.json(await activateEfficiencyScenario(new URL(request.url).searchParams.get("building") || undefined));
  } catch (error) {
    const message = error instanceof Error ? error.message : "The scenario could not be applied.";
    return Response.json({ error: message }, { status: error instanceof BuildingNotFoundError ? 404 : 503 });
  }
}
