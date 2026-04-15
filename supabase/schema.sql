create extension if not exists pgcrypto;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  crm_id bigint,
  order_number text,
  customer_name text,
  customer_label text,
  total_sum numeric(12, 2) not null default 0,
  city text,
  status text,
  created_at timestamptz not null,
  synced_at timestamptz not null default now(),
  alert_sent_at timestamptz,
  raw_payload jsonb not null default '{}'::jsonb
);

create index if not exists idx_orders_created_at on public.orders (created_at desc);
create index if not exists idx_orders_total_sum on public.orders (total_sum desc);
create index if not exists idx_orders_alert_pending on public.orders (alert_sent_at) where alert_sent_at is null;

create table if not exists public.dashboard_orders (
  external_id text primary key,
  order_number text,
  customer_label text,
  city text,
  total_sum numeric(12, 2) not null default 0,
  status text,
  created_at timestamptz not null,
  synced_at timestamptz not null default now()
);

create index if not exists idx_dashboard_orders_created_at on public.dashboard_orders (created_at desc);
create index if not exists idx_dashboard_orders_city on public.dashboard_orders (city);

alter table public.orders enable row level security;
alter table public.dashboard_orders enable row level security;

grant select on public.dashboard_orders to anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'dashboard_orders'
      and policyname = 'Public can read dashboard_orders'
  ) then
    create policy "Public can read dashboard_orders"
      on public.dashboard_orders
      for select
      to anon, authenticated
      using (true);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'dashboard_orders'
  ) then
    alter publication supabase_realtime add table public.dashboard_orders;
  end if;
end
$$;
