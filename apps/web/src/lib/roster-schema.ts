import { z } from "zod";
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const range = z.tuple([z.string().max(5), z.string().max(5)]);
const date = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/)
  .refine((value) => {
    const d = new Date(`${value}T00:00:00Z`);
    return (
      Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value
    );
  });
export const rosterSchema = z
  .array(
    z
      .object({
        id: z.string().min(1).max(120),
        name: z.string().max(100),
        short_name: z.string().max(100),
        classes_revision: z.union([z.literal(0), z.literal(1)]),
        classes: z.object({
          mon: z.array(range).optional(),
          tue: z.array(range).optional(),
          wed: z.array(range).optional(),
          thu: z.array(range).optional(),
          fri: z.array(range).optional(),
          sat: z.array(range).optional(),
          sun: z.array(range).optional(),
        }),
        unavailable_rules: z.array(
          z.object({
            date,
            mode: z.literal("all").optional(),
            unavailable_shifts: z.array(z.string()).optional(),
            only_shifts: z.array(z.string()).optional(),
            reason: z.string().max(500).optional(),
          }),
        ),
      })
      .refine(
        (assistant) =>
          assistant.classes_revision === 0 ||
          Object.values(assistant.classes).every((ranges) =>
            (ranges ?? []).every(
              ([start, end]) =>
                time.safeParse(start).success &&
                time.safeParse(end).success &&
                start < end,
            ),
          ),
        "확인된 수업 시간의 시작과 종료를 확인해 주세요.",
      ),
  )
  .max(200)
  .refine((rows) => new Set(rows.map((row) => row.id)).size === rows.length);
