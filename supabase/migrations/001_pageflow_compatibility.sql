-- PageFlow compatibility migration for projects created from older schemas.
-- Safe to run repeatedly in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  role text not null default 'creator' check (role in ('admin', 'creator')),
  created_at timestamptz not null default now()
);

create table if not exists public.landing_pages (
  id uuid primary key default gen_random_uuid(),
  creator_name text not null,
  slug text not null unique,
  profile_image_url text,
  title text not null,
  heading text not null,
  description text default '',
  button1_text text not null,
  button1_url text not null,
  button2_text text not null,
  button2_url text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.landing_pages add column if not exists profile_image_url text;
alter table public.landing_pages add column if not exists description text default '';
alter table public.landing_pages add column if not exists status text not null default 'active';
alter table public.landing_pages add column if not exists created_by uuid references public.users(id) on delete set null;
alter table public.landing_pages add column if not exists extra_buttons jsonb not null default '[]'::jsonb;
alter table public.landing_pages add column if not exists created_at timestamptz not null default now();
alter table public.landing_pages add column if not exists updated_at timestamptz not null default now();

create table if not exists public.page_analytics (
  id uuid primary key default gen_random_uuid(),
  landing_page_id uuid not null references public.landing_pages(id) on delete cascade,
  event_type text not null,
  created_at timestamptz not null default now()
);

create index if not exists landing_pages_status_idx on public.landing_pages(status);
create index if not exists landing_pages_created_at_idx on public.landing_pages(created_at desc);
create index if not exists landing_pages_created_by_idx on public.landing_pages(created_by);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists landing_pages_set_updated_at on public.landing_pages;
create trigger landing_pages_set_updated_at
before update on public.landing_pages
for each row execute function public.set_updated_at();

grant select on public.users to authenticated;
grant all on public.users to service_role;
grant select on public.landing_pages to anon;
grant select, insert, update, delete on public.landing_pages to authenticated;
grant all on public.landing_pages to service_role;
grant select on public.page_analytics to authenticated;
grant all on public.page_analytics to service_role;

-- Keep the service-role backend fully functional while preserving RLS for clients.
alter table public.users enable row level security;
alter table public.landing_pages enable row level security;
alter table public.page_analytics enable row level security;

-- Refresh PostgREST schema cache after DDL changes.
notify pgrst, 'reload schema';
