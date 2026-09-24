import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { decodeClasses, encodeClasses } from "@/lib/roster-model";
import { rosterSchema } from "@/lib/roster-schema";
import { revisionOf } from "@/lib/revision";
import type { AssistantProfile } from "@part-time/scheduler-core";
export const dynamic = "force-dynamic";

interface RosterRow {
  id: string;
  name: string;
  short_name: string;
  classes: unknown;
  unavailable_rules: AssistantProfile["unavailable_rules"];
  updated_by: string;
  updated_at: Date;
}
function profiles(rows: RosterRow[]): AssistantProfile[] {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    short_name: row.short_name,
    ...decodeClasses(row.classes),
    unavailable_rules: row.unavailable_rules ?? [],
  }));
}
function revision(rows: RosterRow[]) {
  return revisionOf(
    rows.map((row) => ({
      ...row,
      updated_at: new Date(row.updated_at).toISOString(),
    })),
  );
}
export async function GET() {
  try {
    const rows = await getDb()<
      RosterRow[]
    >`select id, name, short_name, classes, unavailable_rules, updated_by, updated_at
      from roster_assistants order by sort_order, id`;
    const latest = rows.reduce<RosterRow | null>(
      (a, b) => (!a || new Date(b.updated_at) > new Date(a.updated_at) ? b : a),
      null,
    );
    return NextResponse.json({
      assistants: profiles(rows),
      revision: revision(rows),
      lastUpdatedAt: latest?.updated_at ?? null,
      lastUpdatedBy: latest?.updated_by ?? null,
    });
  } catch {
    return NextResponse.json(
      {
        error: "조교 명단을 불러오지 못했습니다. 이 기기의 편집은 보존됩니다.",
      },
      { status: 503 },
    );
  }
}
export async function PUT(request: Request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  const parsed = rosterSchema.safeParse(body.assistants);
  const actorName = String(body.actorName ?? "").trim();
  if (!parsed.success || !actorName)
    return NextResponse.json(
      { error: "명단과 수업 시간을 확인해 주세요." },
      { status: 400 },
    );
  if (typeof body.baseRevision !== "string")
    return NextResponse.json(
      { error: "서버 명단을 먼저 불러와 주세요." },
      { status: 428 },
    );
  try {
    const sql = getDb();
    const result = await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext('part-time:roster'))`;
      const before = await tx<
        RosterRow[]
      >`select id, name, short_name, classes, unavailable_rules, updated_by, updated_at
        from roster_assistants order by sort_order, id`;
      if (revision(before) !== body.baseRevision) return null;
      const assistants = parsed.data;
      const ids = assistants.map((a) => a.id);
      await tx`delete from roster_assistants where not (id = any(${ids}::text[]))`;
      if (assistants.length)
        await tx`
        insert into roster_assistants (id, name, short_name, classes, unavailable_rules, sort_order, updated_by, updated_at)
        select id, name, short_name, classes::jsonb, rules::jsonb, sort_order, ${actorName}, clock_timestamp()
        from unnest(${ids}::text[], ${assistants.map((a) => a.name)}::text[], ${assistants.map((a) => a.short_name)}::text[],
          ${assistants.map((a) => JSON.stringify(encodeClasses(a)))}::text[],
          ${assistants.map((a) => JSON.stringify(a.unavailable_rules))}::text[], ${assistants.map((_, i) => i)}::int[])
          as t(id, name, short_name, classes, rules, sort_order)
        on conflict (id) do update set name = excluded.name, short_name = excluded.short_name,
          classes = excluded.classes || jsonb_build_object('previous',
            case when roster_assistants.classes->>'version' = '1' then roster_assistants.classes->'previous' else roster_assistants.classes end),
          unavailable_rules = excluded.unavailable_rules, sort_order = excluded.sort_order,
          updated_by = excluded.updated_by, updated_at = excluded.updated_at`;
      const after = await tx<
        RosterRow[]
      >`select id, name, short_name, classes, unavailable_rules, updated_by, updated_at
        from roster_assistants order by sort_order, id`;
      return {
        ok: true,
        revision: revision(after),
        updatedAt: new Date().toISOString(),
      };
    });
    return result
      ? NextResponse.json(result)
      : NextResponse.json(
          {
            error:
              "다른 사용자가 수정했습니다. 편집을 보관하고 서버 내용을 확인해 주세요.",
          },
          { status: 409 },
        );
  } catch {
    return NextResponse.json(
      { error: "서버 저장 실패. 편집은 이 기기에 보관됩니다." },
      { status: 503 },
    );
  }
}
