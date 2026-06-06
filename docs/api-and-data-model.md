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
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  published_at timestamptz
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

GET    /api/months/:month/shifts
PATCH  /api/shifts/:id/assign
PATCH  /api/shifts/:id/lock

GET    /api/months/:month/export.csv
GET    /api/months/:month/export.xlsx
GET    /api/audit-logs
```

## Permission Rules

- Assistants can read published schedules.
- Assistants can edit only their own classes and availability before submission deadline.
- Schedulers can generate and edit draft schedules.
- Schedulers can publish schedules, but only admins can reopen published schedules.
- Every mutation writes an audit log.
