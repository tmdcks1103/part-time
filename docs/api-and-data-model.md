# API and Data Model

This document is the target backend contract for the production version. The current web app uses mock auth and in-memory state, but the UI is shaped around these resources.

## Roles

- `admin`: manages users, roles, global settings.
- `scheduler`: creates, edits, locks, and publishes monthly schedules.
- `assistant`: edits own classes and unavailable times, views own schedule.
- `viewer`: read-only access.

## Core Tables

```sql
create table app_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id text unique not null,
  email text unique not null,
  name text not null,
  role text not null check (role in ('admin', 'scheduler', 'assistant', 'viewer')),
  created_at timestamptz not null default now()
);

create table assistants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id),
  display_name text not null,
  short_name text not null,
  active boolean not null default true
);

create table class_blocks (
  id uuid primary key default gen_random_uuid(),
  assistant_id uuid not null references assistants(id) on delete cascade,
  day_of_week int not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null
);

create table availability_rules (
  id uuid primary key default gen_random_uuid(),
  assistant_id uuid not null references assistants(id) on delete cascade,
  date date not null,
  mode text not null check (mode in ('all', 'unavailable_shifts', 'only_shifts')),
  shift_keys text[] not null default '{}',
  reason text
);

create table schedule_months (
  id uuid primary key default gen_random_uuid(),
  month text not null unique,
  status text not null check (status in ('draft', 'locked', 'published')) default 'draft',
  fairness_tolerance_hours numeric not null default 10,
  ignore_class_conflicts boolean not null default false,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  published_at timestamptz
);

create table fairness_windows (
  id uuid primary key default gen_random_uuid(),
  schedule_month_id uuid not null references schedule_months(id) on delete cascade,
  label text not null,
  start_date date not null,
  end_date date not null,
  tolerance_hours numeric not null default 0,
  active boolean not null default true
);

create table schedule_shifts (
  id uuid primary key default gen_random_uuid(),
  schedule_month_id uuid not null references schedule_months(id) on delete cascade,
  date date not null,
  shift_key text not null,
  shift_name text not null,
  start_time time not null,
  end_time time not null,
  credit_hours numeric not null,
  assigned_assistant_id uuid references assistants(id),
  locked boolean not null default false,
  note text
);

create table schedule_versions (
  id uuid primary key default gen_random_uuid(),
  schedule_month_id uuid not null references schedule_months(id) on delete cascade,
  created_by uuid references app_users(id),
  label text not null,
  snapshot_json jsonb not null,
  created_at timestamptz not null default now()
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references app_users(id),
  action text not null,
  entity_type text not null,
  entity_id text not null,
  before_json jsonb,
  after_json jsonb,
  created_at timestamptz not null default now()
);
```

## REST Contract

```text
GET    /api/me
POST   /api/auth/admin-login
POST   /api/auth/logout

GET    /api/assistants
POST   /api/assistants
PATCH  /api/assistants/:id

GET    /api/assistants/:id/classes
PUT    /api/assistants/:id/classes
GET    /api/assistants/:id/availability
PUT    /api/assistants/:id/availability

GET    /api/months/:month
POST   /api/months/:month/generate
PATCH  /api/months/:month/status
POST   /api/period-schedules/generate

GET    /api/months/:month/shifts
PATCH  /api/shifts/:id/assign
PATCH  /api/shifts/:id/lock

GET    /api/months/:month/export.csv
GET    /api/months/:month/export.xlsx
GET    /api/audit-logs
```

## API Feature Items

### 1. Admin access

- `POST /api/auth/admin-login`: validates the administrator password and creates an HTTP-only admin session.
- `POST /api/auth/logout`: clears the current admin session.
- `GET /api/me`: returns the current authenticated user, role, and feature permissions.

Current lightweight implementation uses `ADMIN_ACCESS_PASSWORD` and `ADMIN_SESSION_SECRET`. Production can replace this contract with Clerk, Supabase Auth, or another identity provider without changing the product screens.

### 2. Monthly schedule workspace

- `GET /api/months/:month`: returns month metadata, status, generation settings, summary metrics, and latest version.
- `POST /api/months/:month/generate`: generates a draft schedule from assistants, class blocks, availability rules, and shift templates.
- `PATCH /api/months/:month/status`: changes a schedule status between `draft`, `locked`, and `published`.

Expected controls:

- month selection
- fairness tolerance
- vacation mode / class-conflict toggle
- period fairness windows, such as July 15 through month end for new assistant onboarding
- generation attempts
- deterministic seed
- status transition guardrails

### 3. Period schedule workspace

- `POST /api/period-schedules/generate`: generates a draft schedule for only `start_date` through `end_date`, using the same assistants, class blocks, availability rules, and shift templates as the monthly scheduler.

Expected controls:

- start date and end date
- fairness tolerance for the selected period only
- class-conflict toggle for vacation operation
- generation attempts and deterministic seed
- manual assignment against the period shift list

This workspace is intentionally narrower than the monthly scheduler. It exists for short operational windows such as July 15 through July 31, where schedulers need to equalize work within the period without navigating the full monthly editing surface.

### 4. Assistant management

- `GET /api/assistants`: lists active and inactive assistants with monthly hour/night/workload summary.
- `POST /api/assistants`: creates a new assistant profile.
- `PATCH /api/assistants/:id`: updates name, short name, active state, and linked user.

This supports the left-side assistant roster and the selected assistant detail panel.

### 5. Class-time input

- `GET /api/assistants/:id/classes`: returns weekly class blocks for one assistant.
- `PUT /api/assistants/:id/classes`: replaces weekly class blocks after validating day/time ranges.

Class blocks are hard constraints during regular terms: if a class overlaps a shift by even one minute, that assistant is excluded from the shift candidate list. During vacation periods, a schedule month can set `ignore_class_conflicts=true` so stored class blocks remain editable but do not exclude candidates.

### 6. Availability and quick input

- `GET /api/assistants/:id/availability?month=YYYY-MM`: returns date-based unavailable rules.
- `PUT /api/assistants/:id/availability`: replaces unavailable rules for the target month.
- `POST /api/assistants/:id/availability/parse`: parses human input such as `14-17 전체불가`, `16 오픈 불가`, or `20 야간 불가` into normalized availability rules.

This is the key workflow for reducing manual data entry when the scheduler receives text from assistants.

### 7. Shift assignment and manual adjustment

- `GET /api/months/:month/shifts`: returns all generated shifts and assigned assistants.
- `PATCH /api/shifts/:id/assign`: manually assigns a shift to an assistant or marks it unassigned.
- `PATCH /api/shifts/:id/lock`: locks or unlocks a shift so regeneration will not overwrite it.

Manual assignment must validate:

- assistant is not blocked by class or availability
- assistant is not already working another shift that day
- locked or published schedules require elevated permission

### 8. Fairness metrics

- `GET /api/months/:month/summary`: returns assigned count, unassigned count, total credit hours, hour range, night range, weekend range, and per-assistant workload.
- `POST /api/months/:month/validate`: returns hard constraint violations and fairness warnings without saving changes.
- Period fairness windows return the same workload summary restricted to their date range and are validated against each window's tolerance.

Current product priorities:

- minimize active period fairness windows first
- keep monthly credited hours within tolerance
- distribute night shifts as evenly as possible
- avoid repeated same-day assignment
- surface unassigned shifts clearly

### 9. Versions and restore

- `GET /api/months/:month/versions`: lists saved snapshots.
- `POST /api/months/:month/versions`: saves a labeled snapshot of config and assignments.
- `POST /api/versions/:id/restore`: restores a previous snapshot into a draft schedule.

Versions should be created after generation, before publish, and before any bulk overwrite.

### 10. Export

- `GET /api/months/:month/export.csv`: downloads the current schedule as CSV.
- `GET /api/months/:month/export.xlsx`: downloads an Excel workbook with schedule, summary, and validation sheets.
- `GET /api/months/:month/export.json`: downloads the full workspace payload for backup or migration.

### 11. Audit log

- `GET /api/audit-logs`: lists mutations by actor, action, entity, timestamp, and before/after payload.

Every mutation should write an audit log entry, especially generation, manual assignment, availability edits, status changes, and version restore.

## Permission Rules

- Assistants can read published schedules.
- Assistants can edit only their own classes and availability before submission deadline.
- Schedulers can generate and edit draft schedules.
- Schedulers can publish schedules, but only admins can reopen published schedules.
- Every mutation writes an audit log.
