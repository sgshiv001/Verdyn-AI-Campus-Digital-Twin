import { planRecommendation } from "@/lib/campus-data";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const recommendation = await planRecommendation(id);
    if (!recommendation) return Response.json({ error: "Recommendation not found or already planned." }, { status: 404 });
    return Response.json({ recommendation });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The recommendation could not be updated.";
    return Response.json({ error: message }, { status: 503 });
  }
}
