-- Healthy Chow: run this once in Supabase (SQL Editor -> New query -> paste -> Run).
-- Creates a profile per user that holds subscription status (updated by the Stripe webhook).

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  subscribed boolean not null default false,
  plan text,
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- A user can read and update only their own profile row.
drop policy if exists "own profile read" on public.profiles;
create policy "own profile read" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "own profile update" on public.profiles;
create policy "own profile update" on public.profiles
  for update using (auth.uid() = id);

-- Auto-create a profile row whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Outbound order-click log (written by /api/out for conversion tracking).
-- Insert-only for the anon key; read it from the Supabase dashboard.
create table if not exists public.order_clicks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  restaurant text not null,
  kind text not null,
  dest text not null
);

alter table public.order_clicks enable row level security;

drop policy if exists "anon can log clicks" on public.order_clicks;
create policy "anon can log clicks" on public.order_clicks
  for insert to anon with check (true);
