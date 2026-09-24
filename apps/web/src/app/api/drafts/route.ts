import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { revisionOf } from "@/lib/revision";
import { z } from "zod";
export const dynamic = "force-dynamic";
const scopeSchema = z
  .string()
  .regex(
    /^(month:\d{4}-(0[1-9]|1[0-2])|period:\d{4}-\d{2}-\d{2}:\d{4}-\d{2}-\d{2})$/,
  );
const schema = z.object({
  scopeKey: scopeSchema,
  kind: z.enum(["month", "period"]),
  actorName: z.string().trim().min(1),
  settings: z.record(z.unknown()),
  manualAssignments: z.record(z.string()),
  baseRevision: z.string().nullable(),
});
export async function GET(request: Request) {
  const scope = scopeSchema.safeParse(
    new URL(request.url).searchParams.get("scope"),
  );
  if (!scope.success)
    return NextResponse.json({ error: "잘못된 기간" }, { status: 400 });
  try {
    const rows =
      await getDb()`select * from schedule_drafts where scope_key = ${scope.data}`;
    return NextResponse.json({
      draft: rows[0] ?? null,
      revision: rows[0] ? revisionOf(rows[0]) : null,
    });
  } catch {
    return NextResponse.json(
      { error: "근무표를 불러오지 못했습니다." },
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
  if (!("baseRevision" in body))
    return NextResponse.json({ error: "새로고침해 주세요." }, { status: 428 });
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "입력값을 확인해 주세요." },
      { status: 400 },
    );
  const {
    scopeKey,
    kind,
    actorName,
    settings,
    manualAssignments,
    baseRevision,
  } = parsed.data;
  if (!scopeKey.startsWith(`${kind}:`))
    return NextResponse.json({ error: "잘못된 기간" }, { status: 400 });
  try {
    const sql = getDb();
    const result = await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext(${scopeKey}))`;
      const rows =
        await tx`select * from schedule_drafts where scope_key = ${scopeKey}`;
      if ((rows[0] ? revisionOf(rows[0]) : null) !== baseRevision) return null;
      const saved =
        await tx`insert into schedule_drafts (scope_key, kind, settings, manual_assignments, updated_by, updated_at)
        values (${scopeKey}, ${kind}, ${sql.json(settings as never)}, ${sql.json(manualAssignments)}, ${actorName}, clock_timestamp())
        on conflict (scope_key) do update set settings = excluded.settings, manual_assignments = excluded.manual_assignments,
          updated_by = excluded.updated_by, updated_at = excluded.updated_at, summary = null
        returning *`;
      return {
        ok: true,
        revision: revisionOf(saved[0]),
        updatedAt: saved[0].updated_at,
      };
    });
    return result
      ? NextResponse.json(result)
      : NextResponse.json(
          { error: "다른 사용자가 수정했습니다." },
          { status: 409 },
        );
  } catch {
    return NextResponse.json(
      { error: "서버 저장 실패. 편집은 이 기기에 보관됩니다." },
      { status: 503 },
    );
  }
}
