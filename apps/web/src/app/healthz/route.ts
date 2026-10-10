export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json(
    { ok: true, service: "web", sha: process.env.GIT_SHA ?? "dev" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
