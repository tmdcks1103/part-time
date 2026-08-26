import { NextResponse } from "next/server";
import { getDb, logActivity } from "@/lib/db";

export const dynamic = "force-dynamic";

interface DraftRow {
  scope_key: string;
  kind: string;
  settings: Record<string, unknown>;
  manual_assignments: Record<string, string>;
  summary: Record<string, unknown> | null;
  updated_by: string;
  updated_at: string;
}

export async function GET(request: Request) {
  const scopeKey = new URL(request.url).searchParams.get("scope");
  if (!scopeKey) return NextResponse.json({ error: "scope is required" }, { status: 400 });

  const sql = getDb();
  const rows = await sql<DraftRow[]>`
    select scope_key, kind, settings, manual_assignments, summary, updated_by, updated_at
    from schedule_drafts
    where scope_key = ${scopeKey}
  `;
  return NextResponse.json({ draft: rows[0] ?? null });
}

export async function PUT(request: Request) {
  const body = await request.json();
  const scopeKey = String(body.scopeKey ?? "").trim();
  const kind = body.kind === "period" ? "period" : "month";
  const actorName = String(body.actorName ?? "").trim();
  const actorRole = body.actorRole ? String(body.actorRole) : undefined;
  const settings = body.settings ?? {};
  const manualAssignments = body.manualAssignments ?? {};
  const summary = body.summary ?? null;

  if (!scopeKey) return NextResponse.json({ error: "scopeKey is required" }, { status: 400 });
  if (!actorName) return NextResponse.json({ error: "actorName is required" }, { status: 400 });

  const sql = getDb();
  await sql`
    insert into schedule_drafts (scope_key, kind, settings, manual_assignments, summary, updated_by, updated_at)
    values (${scopeKey}, ${kind}, ${sql.json(settings)}, ${sql.json(manualAssignments)}, ${summary ? sql.json(summary) : null}, ${actorName}, now())
    on conflict (scope_key) do update set
      kind = excluded.kind,
      settings = excluded.settings,
      manual_assignments = excluded.manual_assignments,
      summary = excluded.summary,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  `;

  await logActivity({
    actorName,
    actorRole,
    action: "근무표 저장",
    detail: describeScope(scopeKey),
    scopeKey
  });

  return NextResponse.json({ ok: true, updatedAt: new Date().toISOString() });
}

function describeScope(scopeKey: string) {
  const [kind, ...rest] = scopeKey.split(":");
  if (kind === "month") return `${rest[0]} 월간 근무표`;
  if (kind === "period") return `${rest[0]} ~ ${rest[1]} 기간 근무표`;
  return scopeKey;
}
