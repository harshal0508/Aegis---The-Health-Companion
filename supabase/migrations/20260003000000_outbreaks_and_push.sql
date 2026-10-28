-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Production Outbreak Advisories, Media Intelligence & Push
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Official Government Outbreak Advisories (Ingested from IDSP / NCDC)
create table if not exists regional_advisories (
  id uuid primary key default gen_random_uuid(),
  state text not null,
  district text not null,
  pincode_prefix text,
  disease_name text not null,
  category text not null check (category in ('vector_borne', 'respiratory', 'water_borne', 'viral_contact', 'general')),
  severity text not null check (severity in ('high', 'moderate', 'low')),
  cases_count int default 0,
  deaths_count int default 0,
  report_date date not null,
  source_title text not null,
  source_url text not null,
  action_summary text,
  status text not null default 'active' check (status in ('active', 'resolved', 'monitoring')),
  created_at timestamptz default now()
);

-- Index for fast district lookup
create index if not exists idx_regional_advisories_district on regional_advisories(lower(district));
create index if not exists idx_regional_advisories_pincode on regional_advisories(pincode_prefix);

-- RLS: Public read (all authenticated users can read health advisories), write restricted to admin/service_role
alter table regional_advisories enable row level security;

create policy "Authenticated users can read regional advisories"
  on regional_advisories for select
  to authenticated
  using (true);

-- 2. Cached Local Media Watch (Ingested from Local News RSS)
create table if not exists outbreak_news_items (
  id uuid primary key default gen_random_uuid(),
  district text not null,
  headline text not null,
  publisher text not null,
  article_url text not null,
  published_date date not null,
  snippet text,
  verified_by_authority boolean default false,
  created_at timestamptz default now()
);

create index if not exists idx_outbreak_news_district on outbreak_news_items(lower(district));

alter table outbreak_news_items enable row level security;

create policy "Authenticated users can read news items"
  on outbreak_news_items for select
  to authenticated
  using (true);

-- 3. Web Push Subscriptions (Browser Push Notification Endpoints)
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null,
  keys_p256dh text not null,
  keys_auth text not null,
  district text default 'Indore',
  notify_on_high_severity boolean default true,
  created_at timestamptz default now(),
  unique(user_id, endpoint)
);

alter table push_subscriptions enable row level security;

create policy "Users can manage their own push subscriptions"
  on push_subscriptions for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
