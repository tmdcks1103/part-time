import { NextResponse } from "next/server";
import type { AssistantProfile } from "@part-time/scheduler-core";
import { getDb, logActivity } from "@/lib/db";

export const dynamic = "force-dynamic";

interface RosterRow {
  id: string;
  name: string;
  short_name: string;
  classes: AssistantProfile["classes"];
  unavailable_rules: AssistantProfile["unavailable_rules"];
  updated_by: string;
  updated_at: string;
}

function toProfile(row: RosterRow): AssistantProfile {
  return {
    id: row.id,
    name: row.name,
    short_name: row.short_name,
    classes: row.classes ?? {},
    unavailable_rules: row.unavailable_rules ?? []
  };
}

export async function GET() {
  const sql = getDb();
  const rows = await sql<RosterRow[]>`
    select id, name, short_name, classes, unavailable_rules, updated_by, updated_at
    from roster_assistants
    order by sort_order asc, updated_at asc
  `;
  const lastUpdatedAt = rows.reduce<string | null>((latest, row) => {
    if (!latest || row.updated_at > latest) return row.updated_at;
    return latest;
  }, null);
  const lastUpdatedBy = rows.find((row) => row.updated_at === lastUpdatedAt)?.updated_by ?? null;
  return NextResponse.json({
    assistants: rows.map(toProfile),
    lastUpdatedAt,
    lastUpdatedBy
  });
}

export async function PUT(request: Request) {
  const body = await request.json();
  const assistants = body.assistants as AssistantProfile[];
  const actorName = String(body.actorName ?? "").trim();
  const actorRole = body.actorRole ? String(body.actorRole) : undefined;

  if (!Array.isArray(assistants)) {
    return NextResponse.json({ error: "assistants must be an array" }, { status: 400 });
  }
  if (!actorName) {
    return NextResponse.json({ error: "actorName is required" }, { status: 400 });
  }

  const sql = getDb();
  const ids = assistants.map((assistant) => assistant.id);

  // A previous version of this route upserted one assistant per round trip in a loop, which
  // against Supabase's pooled connection took several seconds for a dozen assistants — long
  // enough that a user switching screens right after an edit would navigate back before the
  // save had actually landed, making the edit look like it "reset". A single set-based upsert
  // via unnest() does the whole roster in one round trip regardless of how many assistants there are.
  const names = assistants.map((assistant) => assistant.name);
  const shortNames = assistants.map((assistant) => assistant.short_name);
  const classesList = assistants.map((assistant) => JSON.stringify(assistant.classes ?? {}));
  const rulesList = assistants.map((assistant) => JSON.stringify(assistant.unavailable_rules ?? []));
  const sortOrders = assistants.map((_, index) => index);
  const updatedBys = assistants.map(() => actorName);

  await sql.begin(async (tx) => {
    await tx`delete from roster_assistants where not (id = any(${ids}))`;
    if (assistants.length) {
      await tx`
        insert into roster_assistants (id, name, short_name, classes, unavailable_rules, sort_order, updated_by, updated_at)
        select id, name, short_name, classes::jsonb, unavailable_rules::jsonb, sort_order, updated_by, now()
        from unnest(
          ${ids}::text[],
          ${names}::text[],
          ${shortNames}::text[],
          ${classesList}::text[],
          ${rulesList}::text[],
          ${sortOrders}::int[],
          ${updatedBys}::text[]
        ) as t(id, name, short_name, classes, unavailable_rules, sort_order, updated_by)
        on conflict (id) do update set
          name = excluded.name,
          short_name = excluded.short_name,
          classes = excluded.classes,
          unavailable_rules = excluded.unavailable_rules,
          sort_order = excluded.sort_order,
          updated_by = excluded.updated_by,
          updated_at = excluded.updated_at
      `;
    }
  });

  await logActivity({
    actorName,
    actorRole,
    action: "조교 명단 저장",
    detail: `${assistants.length}명`
  });

  return NextResponse.json({ ok: true, updatedAt: new Date().toISOString() });
}
