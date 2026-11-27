import { parseCampusCsv, MAX_CSV_BYTES } from "@/lib/campus-csv";
import { previewResponse, saveCampusImport, UPLOADED_CSV_SOURCE } from "@/lib/campus-imports";

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json")) return Response.json({error: "Send a CSV preview as JSON."}, {status: 415});
  const reader = request.body?.getReader();
  if (!reader) return Response.json({error: "Choose a CSV file."}, {status: 400});
  let input: {csv?: unknown; name?: unknown; action?: unknown};
  try {
    const decoder = new TextDecoder();
    let body = "", length = 0;
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      length += value.length;
      // A single CSV byte can occupy six bytes when escaped in JSON.
      if (length > MAX_CSV_BYTES * 6 + 4096) {
        await reader.cancel();
        return Response.json({error: "Use a CSV up to 500 KB."}, {status: 413});
      }
      body += decoder.decode(value, {stream: true});
    }
    input = JSON.parse(body + decoder.decode());
    if (!input || typeof input !== "object") throw new Error();
  } catch { return Response.json({error: "The request is not valid JSON."}, {status: 400}); }
  if (typeof input.csv !== "string" || (input.action !== "preview" && input.action !== "import")) return Response.json({error: "Choose a CSV file and preview or import it."}, {status: 400});
  let preview;
  try { preview = parseCampusCsv(input.csv, UPLOADED_CSV_SOURCE); }
  catch (error) { return Response.json({error: error instanceof Error ? error.message : "Invalid CSV."}, {status: 422}); }
  if (input.action === "preview") return Response.json(previewResponse(preview));
  try {
    const result = await saveCampusImport(preview, typeof input.name === "string" && input.name.trim() ? input.name : "Campus CSV");
    return Response.json(previewResponse(result), {status: 201});
  } catch (error) {
    console.error("Campus CSV save failed", error);
    return Response.json({error: "The data could not be saved. Your previous dataset is still available; please retry."}, {status: 503});
  }
}
