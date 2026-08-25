-- PageFlow database schema, RLS policies and analytics.
-- Run this file in the Supabase SQL editor.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  role text not null default 'creator' check (role in ('admin', 'creator')),
  created_at timestamptz not null default now()
);

grant select on public.users to authenticated;
grant all on public.users to service_role;

create table if not exists public.landing_pages (
  id uuid primary key default gen_random_uuid(),
  creator_name text not null check (char_length(creator_name) between 1 and 100),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  profile_image_url text,
  title text not null,
  heading text not null,
  description text default '',
  button1_text text not null,
  button1_url text not null check (button1_url ~* '^https?://'),
  button2_text text not null,
  button2_url text not null check (button2_url ~* '^https?://'),
  extra_buttons jsonb not null default '[]'::jsonb,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Migration for existing databases (safe to re-run):
alter table public.landing_pages
  add column if not exists extra_buttons jsonb not null default '[]'::jsonb;

grant select on public.landing_pages to anon;
grant select, insert, update, delete on public.landing_pages to authenticated;
grant all on public.landing_pages to service_role;

create table if not exists public.page_analytics (
  id uuid primary key default gen_random_uuid(),
  landing_page_id uuid not null references public.landing_pages(id) on delete cascade,
  event_type text not null check (event_type in ('page_view', 'cta1_click', 'cta2_click')),
  created_at timestamptz not null default now()
);

grant select on public.page_analytics to authenticated;
grant all on public.page_analytics to service_role;

create index if not exists landing_pages_status_idx on public.landing_pages(status);
create index if not exists landing_pages_created_at_idx on public.landing_pages(created_at desc);
create index if not exists landing_pages_created_by_idx on public.landing_pages(created_by);
create index if not exists page_analytics_page_idx on public.page_analytics(landing_page_id);
create index if not exists page_analytics_event_idx on public.page_analytics(event_type);

-- Keep updated_at correct even when rows are changed directly in Supabase.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists landing_pages_set_updated_at on public.landing_pages;
create trigger landing_pages_set_updated_at
before update on public.landing_pages
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Role helper (security definer avoids recursive RLS on public.users)
-- ---------------------------------------------------------------------------

create or replace function public.has_role(_user_id uuid, _role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users u where u.id = _user_id and u.role = _role
  )
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.users enable row level security;
alter table public.landing_pages enable row level security;
alter table public.page_analytics enable row level security;

drop policy if exists "Users can read their own profile" on public.users;
drop policy if exists "Admins can read all user profiles" on public.users;
drop policy if exists "Admins can manage user rows" on public.users;

create policy "Users can read their own profile" on public.users
  for select to authenticated using (auth.uid() = id);
create policy "Admins can read all user profiles" on public.users
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Admins can manage user rows" on public.users
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "Public page reads are allowed for active pages" on public.landing_pages;
drop policy if exists "Admins can insert landing pages" on public.landing_pages;
drop policy if exists "Admins can update landing pages" on public.landing_pages;
drop policy if exists "Admins can delete landing pages" on public.landing_pages;
drop policy if exists "Admins can read all landing pages" on public.landing_pages;
drop policy if exists "Creators can read assigned landing pages" on public.landing_pages;

-- Public visitors: only active pages.
create policy "Public can read active landing pages" on public.landing_pages
  for select to anon using (status = 'active');

-- Signed-in users: active pages plus, for creators, their own assigned rows.
create policy "Authenticated can read active landing pages" on public.landing_pages
  for select to authenticated using (status = 'active');
create policy "Creators can read assigned landing pages" on public.landing_pages
  for select to authenticated using (created_by = auth.uid());
create policy "Admins can read all landing pages" on public.landing_pages
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));

-- Only admins may write.
create policy "Admins can insert landing pages" on public.landing_pages
  for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));
create policy "Admins can update landing pages" on public.landing_pages
  for update to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));
create policy "Admins can delete landing pages" on public.landing_pages
  for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

-- Analytics: written by the backend (service role) only, readable by admins.
drop policy if exists "Admins can read analytics" on public.page_analytics;
create policy "Admins can read analytics" on public.page_analytics
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------------
-- New auth users default to the least privileged role.
-- Public signup should stay disabled in Supabase Auth for the MVP; the admin
-- account is created manually and promoted with the UPDATE below.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, role)
  values (new.id, new.email, 'creator')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Repair any account that was auto-promoted by the previous (unsafe) trigger.
-- Replace the email below with your real admin address before running.
-- update public.users set role = 'creator' where role = 'admin' and email <> 'admin@yourdomain.com';
-- update public.users set role = 'admin' where email = 'admin@yourdomain.com';

-- ---------------------------------------------------------------------------
-- Seed data (kept from the original project)
-- ---------------------------------------------------------------------------

insert into public.landing_pages (creator_name, slug, profile_image_url, title, heading, description, button1_text, button1_url, button2_text, button2_url, status)
values
('Ayesha', 'ayesha', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=240&h=240&fit=crop&crop=faces', 'Ayesha Reversal Type 2 Protocol', 'Uncontrolled Diabetes - Treatment Information', 'A practical, supportive starting point for understanding your options and taking the next step with confidence.', 'Apply for Treatment', 'https://yourgate.org/treatment', 'Diabetes Reversal Kit', 'https://yourgate.org/diabetes-reversal-kit', 'active'),
('Singh', 'singh', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=240&h=240&fit=crop&crop=faces', 'Singh Wellness Guidance', 'A calmer path to better daily health', 'Simple education and thoughtful resources, shared one step at a time.', 'Start Here', 'https://yourgate.org/start', 'Explore Resources', 'https://yourgate.org/resources', 'active'),
('Rahul', 'rahul', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=240&h=240&fit=crop&crop=faces', 'Rahul Health Notes', 'Understand your health. Make your next move.', '', 'View the Guide', 'https://yourgate.org/guide', 'Contact Rahul', 'https://yourgate.org/contact', 'inactive')
on conflict (slug) do nothing;

insert into storage.buckets (id, name, public) values ('profile-images', 'profile-images', true) on conflict (id) do nothing;

-- Storage: public read, uploads performed by the backend service role only.
drop policy if exists "Public read profile images" on storage.objects;
create policy "Public read profile images" on storage.objects
  for select to anon, authenticated using (bucket_id = 'profile-images');
