import { NextResponse } from "next/server";
import { getDb, logActivity } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const scopeKey = url.searchParams.get("scope");
  const limitParam = url.searchParams.get("limit");
  const limit = Math.min(Math.max(Number(limitParam) || 20, 1), 100);
  if (!scopeKey) return NextResponse.json({ error: "scope is required" }, { status: 400 });

  const sql = getDb();
  const rows = await sql`
    select id, scope_key, kind, label, settings, manual_assignments, summary, created_by, created_at
    from schedule_versions
    where scope_key = ${scopeKey}
    order by created_at desc
    limit ${limit}
  `;
  return NextResponse.json({ versions: rows });
}

export async function POST(request: Request) {
  const body = await request.json();
  const scopeKey = String(body.scopeKey ?? "").trim();
  const kind = body.kind === "period" ? "period" : "month";
  const label = String(body.label ?? "").trim() || "저장된 버전";
  const actorName = String(body.actorName ?? "").trim();
  const actorRole = body.actorRole ? String(body.actorRole) : undefined;
  const settings = body.settings ?? {};
  const manualAssignments = body.manualAssignments ?? {};
  const summary = body.summary ?? null;

  if (!scopeKey) return NextResponse.json({ error: "scopeKey is required" }, { status: 400 });
  if (!actorName) return NextResponse.json({ error: "actorName is required" }, { status: 400 });

  const sql = getDb();
  const rows = await sql`
    insert into schedule_versions (scope_key, kind, label, settings, manual_assignments, summary, created_by)
    values (${scopeKey}, ${kind}, ${label}, ${sql.json(settings as never)}, ${sql.json(manualAssignments as never)}, ${summary ? sql.json(summary as never) : null}, ${actorName})
    returning id, created_at
  `;

  await logActivity({
    actorName,
    actorRole,
    action: "근무표 버전 저장",
    detail: label,
    scopeKey
  });

  return NextResponse.json({ ok: true, id: rows[0].id, createdAt: rows[0].created_at });
}
