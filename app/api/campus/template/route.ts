export async function GET() {
  return new Response("recorded_at,building,resource,value,unit\n", {headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": 'attachment; filename="verdyn-blank-template.csv"',
    "Cache-Control": "no-store",
  }});
}
