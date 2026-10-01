export async function POST() {
  return Response.json({error: "Demo scenarios have been removed. Upload your CSV to analyse readings; this app does not control equipment."}, {status: 410});
}
