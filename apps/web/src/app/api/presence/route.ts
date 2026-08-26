import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

const ONLINE_WINDOW_SECONDS = 90;

export async function GET() {
  const sql = getDb();
  const rows = await sql`
    select actor_name, actor_role, page, scope_key, last_seen_at
    from presence
    where last_seen_at > now() - make_interval(secs => ${ONLINE_WINDOW_SECONDS})
    order by last_seen_at desc
  `;
  return NextResponse.json({ online: rows });
}

export async function POST(request: Request) {
  const body = await request.json();
  const actorName = String(body.actorName ?? "").trim();
  const page = String(body.page ?? "").trim();
  if (!actorName || !page) {
    return NextResponse.json({ error: "actorName and page are required" }, { status: 400 });
  }

  const sql = getDb();
  await sql`
    insert into presence (actor_name, actor_role, page, scope_key, last_seen_at)
    values (${actorName}, ${body.actorRole ? String(body.actorRole) : null}, ${page}, ${body.scopeKey ? String(body.scopeKey) : null}, now())
    on conflict (actor_name) do update set
      actor_role = excluded.actor_role,
      page = excluded.page,
      scope_key = excluded.scope_key,
      last_seen_at = excluded.last_seen_at
  `;
  return NextResponse.json({ ok: true });
}
