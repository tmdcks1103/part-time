-- Shared collaboration state for the part-time scheduler.
-- Accessed only from server-side Next.js route handlers via the direct
-- Postgres connection (POSTGRES_URL), never exposed to the browser.
-- RLS is enabled with no anon/authenticated policies as defense in depth
-- in case these tables are ever exposed through the Data API.

create table if not exists roster_assistants (
  id text primary key,
  name text not null,
  short_name text not null,
  classes jsonb not null default '{}'::jsonb,
  unavailable_rules jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0,
  updated_by text not null default '',
  updated_at timestamptz not null default now()
);

alter table roster_assistants enable row level security;

create table if not exists schedule_drafts (
  scope_key text primary key,
  kind text not null check (kind in ('month', 'period')),
  settings jsonb not null default '{}'::jsonb,
  manual_assignments jsonb not null default '{}'::jsonb,
  summary jsonb,
  updated_by text not null default '',
  updated_at timestamptz not null default now()
);

alter table schedule_drafts enable row level security;

-- schedule_drafts holds only the single latest live state per scope (continuously
-- autosaved, like roster_assistants). schedule_versions is the append-only history on
-- top of that: a new row per meaningful checkpoint (explicit save, a regenerate click,
-- or a throttled periodic snapshot while someone is actively editing), so the "버전"
-- list can show real history and let people load an earlier version back.
create table if not exists schedule_versions (
  id bigint generated always as identity primary key,
  scope_key text not null,
  kind text not null check (kind in ('month', 'period')),
  label text not null,
  settings jsonb not null default '{}'::jsonb,
  manual_assignments jsonb not null default '{}'::jsonb,
  summary jsonb,
  created_by text not null default '',
  created_at timestamptz not null default now()
);

alter table schedule_versions enable row level security;
create index if not exists schedule_versions_scope_idx on schedule_versions (scope_key, created_at desc);

create table if not exists activity_log (
  id bigint generated always as identity primary key,
  actor_name text not null,
  actor_role text,
  action text not null,
  detail text,
  scope_key text,
  created_at timestamptz not null default now()
);

alter table activity_log enable row level security;
create index if not exists activity_log_created_at_idx on activity_log (created_at desc);

create table if not exists presence (
  actor_name text primary key,
  actor_role text,
  page text not null,
  scope_key text,
  last_seen_at timestamptz not null default now()
);

alter table presence enable row level security;
