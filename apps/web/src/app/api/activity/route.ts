import { NextResponse } from "next/server";
import { getDb, logActivity } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limitParam = new URL(request.url).searchParams.get("limit");
  const limit = Math.min(Math.max(Number(limitParam) || 30, 1), 100);

  const sql = getDb();
  const rows = await sql`
    select id, actor_name, actor_role, action, detail, scope_key, created_at
    from activity_log
    order by created_at desc
    limit ${limit}
  `;
  return NextResponse.json({ entries: rows });
}

export async function POST(request: Request) {
  const body = await request.json();
  const actorName = String(body.actorName ?? "").trim();
  const action = String(body.action ?? "").trim();
  if (!actorName || !action) {
    return NextResponse.json({ error: "actorName and action are required" }, { status: 400 });
  }
  await logActivity({
    actorName,
    actorRole: body.actorRole ? String(body.actorRole) : undefined,
    action,
    detail: body.detail ? String(body.detail) : undefined,
    scopeKey: body.scopeKey ? String(body.scopeKey) : undefined
  });
  return NextResponse.json({ ok: true });
}
