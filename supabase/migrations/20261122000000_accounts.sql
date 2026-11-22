-- Accounts, shared settings, team reports and visitor leads.
--
-- Every table has row level security switched on with no policies, so the
-- browser's publishable key can read and write nothing here. The app's server
-- routes use the secret key, check who is signed in, and do the access control.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  role text not null default 'team' check (role in ('admin', 'team')),
  created_at timestamptz not null default now()
);

-- One row: the questions, models and API keys every audit uses.
create table public.app_settings (
  id int primary key default 1 check (id = 1),
  settings jsonb not null default '{}'::jsonb,
  keys jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);
create unique index clients_name_key on public.clients (lower(name));

create table public.reports (
  id uuid primary key,
  client_id uuid references public.clients (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_by_email text,
  brand_name text not null,
  domain text not null,
  summary jsonb not null default '{}'::jsonb,
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index reports_client_idx on public.reports (client_id, created_at desc);

-- What visitors who are not signed in typed into the intake.
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  email text,
  domain text not null,
  urls jsonb not null default '[]'::jsonb,
  brand_hint text not null default '',
  positioning_doc text not null default '',
  claims jsonb not null default '[]'::jsonb,
  user_agent text,
  created_at timestamptz not null default now()
);
create index leads_created_idx on public.leads (created_at desc);

alter table public.profiles enable row level security;
alter table public.app_settings enable row level security;
alter table public.clients enable row level security;
alter table public.reports enable row level security;
alter table public.leads enable row level security;

-- The server's secret key acts as service_role. Grant it access explicitly, so this
-- works whether or not the project exposes new tables automatically.
grant usage on schema public to service_role;
grant all on public.profiles, public.app_settings, public.clients, public.reports, public.leads to service_role;
