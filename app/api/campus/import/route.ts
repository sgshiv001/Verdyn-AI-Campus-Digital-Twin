import { parseCampusCsv, MAX_CSV_BYTES } from "@/lib/campus-csv";
import { previewResponse, saveCampusImport } from "@/lib/campus-imports";

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json")) return Response.json({error: "Send a CSV preview as JSON."}, {status: 415});
  const reader = request.body?.getReader();
  if (!reader) return Response.json({error: "Choose a CSV file."}, {status: 400});
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    length += value.length;
    if (length > MAX_CSV_BYTES * 2) { await reader.cancel(); return Response.json({error: "Use a CSV smaller than 500 KB."}, {status: 413}); }
    chunks.push(value);
  }
  let input: {csv?: unknown; name?: unknown; action?: unknown};
  try {
    const bytes = new Uint8Array(length); let offset = 0;
    chunks.forEach((chunk) => { bytes.set(chunk, offset); offset += chunk.length; });
    input = JSON.parse(new TextDecoder().decode(bytes));
    if (!input || typeof input !== "object") throw new Error();
  } catch { return Response.json({error: "The request is not valid JSON."}, {status: 400}); }
  if (typeof input.csv !== "string" || (input.action !== "preview" && input.action !== "import")) return Response.json({error: "Choose a CSV file and preview or import it."}, {status: 400});
  try { parseCampusCsv(input.csv); }
  catch (error) { return Response.json({error: error instanceof Error ? error.message : "Invalid CSV."}, {status: 422}); }
  if (input.action === "preview") return Response.json(previewResponse(parseCampusCsv(input.csv)));
  try {
    const result = await saveCampusImport(input.csv, typeof input.name === "string" && input.name.trim() ? input.name : "Campus CSV");
    return Response.json(previewResponse(result), {status: 201});
  } catch (error) {
    console.error("Campus CSV save failed", error);
    return Response.json({error: "The data could not be saved. Your previous dataset is still available; please retry."}, {status: 503});
  }
}
