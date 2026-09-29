import { activateEfficiencyScenario } from "@/lib/campus-data";

export async function POST() {
  try {
    return Response.json(await activateEfficiencyScenario());
  } catch (error) {
    const message = error instanceof Error ? error.message : "The scenario could not be applied.";
    return Response.json({ error: message }, { status: 503 });
  }
}
