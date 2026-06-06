# Implementation Plan

## Current State

- `app/`: legacy static prototype. Keep it as a reference/demo.
- `packages/scheduler-core`: reusable TypeScript scheduler engine.
- `apps/web`: Next.js product shell with mock auth and in-memory schedule state.

## Phase 1: Product Skeleton

- [x] Create Next.js workspace.
- [x] Extract scheduler engine into a reusable TypeScript package.
- [x] Add role-aware workspace UI.
- [x] Add assistant editor, schedule table, shift inspector, CSV/JSON export.
- [x] Add environment variable template.
- [x] Add API/data-model documentation.

## Phase 2: Real Persistence

- Choose one:
  - Supabase Postgres + Supabase Auth
  - Supabase Postgres + Clerk Auth
  - Vercel Postgres/Neon + Auth.js
- Implement database tables.
- Replace `src/lib/schedule-store.ts` mock data with server-side queries.
- Add schedule month create/load/save.
- Add schedule versions and audit logs.

## Phase 3: Authentication and Access

- Configure production auth provider.
- Add invite-only onboarding.
- Add role management screen for admins.
- Add email allowlist/domain restrictions.
- Protect server mutations by role.
- Add assistant-only route for own availability/class input.

## Phase 4: Real Workflow

- Add schedule month statuses: `draft`, `locked`, `published`.
- Add input deadline for assistants.
- Add schedule lock per shift.
- Add reasoned conflict panel.
- Add final publish flow.
- Add public/read-only link for published schedules if needed.

## Phase 5: Exports and Notifications

- Add Excel export.
- Add printable PDF view.
- Add email notification on publish.
- Optional: KakaoTalk/SMS reminders.

## Decisions Needed From User

1. Production auth provider:
   - Recommended: Clerk if fastest polished invite/login is important.
   - Recommended: Supabase Auth if keeping cost and vendor count low is important.
2. Domain:
   - Example: `dorm-scheduler.yourdomain.com`.
3. Allowed users:
   - Initial scheduler/admin emails.
   - Assistant email list.
4. Database provider:
   - Recommended: Supabase Postgres for the first production version.
5. Notification scope:
   - Email only, or Kakao/SMS later.
6. Data retention:
   - Keep all schedule versions forever, or archive/delete after a period.
