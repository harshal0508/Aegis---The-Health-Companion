-- =============================================================================
-- MedRecord Full Database Schema & RLS Setup
-- Copy and run this entire script in your Supabase Dashboard -> SQL Editor -> Run
-- =============================================================================

-- 1. Profiles Table
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  dob date,
  blood_group text,
  emergency_contact_name text,
  emergency_contact_phone text,
  created_at timestamptz default now()
);

-- 2. Documents Table
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  storage_path text not null,
  doc_type text,
  doc_date date,
  status text not null default 'uploaded'
    check (status in ('uploaded', 'processing', 'ready', 'failed')),
  page_count int,
  created_at timestamptz default now()
);

-- 3. Pages Table
create table if not exists pages (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  page_no int not null,
  ocr_text text,
  created_at timestamptz default now()
);

-- 4. Items Table
create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  category text not null
    check (category in ('allergy', 'medication', 'condition', 'surgery', 'lab', 'implant')),
  value text not null,
  page_id uuid references pages(id) on delete set null,
  quote text,
  confidence numeric,
  source text not null default 'extracted'
    check (source in ('extracted', 'patient_entered')),
  status text not null default 'extracted'
    check (status in ('extracted', 'confirmed', 'needs_review')),
  normalization_source text not null default 'none'
    check (normalization_source in ('none', 'brand_table', 'rxnorm', 'llm_inferred')),
  last_confirmed_at timestamptz,
  created_at timestamptz default now()
);

-- 5. Emergency Cards Table
create table if not exists emergency_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  token_hash text not null unique,
  visible_categories text[] not null default array[]::text[],
  active boolean not null default true,
  created_at timestamptz default now()
);

-- 6. Access Log Table
create table if not exists access_log (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references emergency_cards(id) on delete cascade,
  accessed_at timestamptz default now(),
  ip_hash text,
  user_agent text
);

-- 7. Family Members Table
create table if not exists family_members (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  member_user_id uuid references profiles(id) on delete set null,
  role text not null check (role in ('view', 'upload')),
  status text not null default 'pending'
    check (status in ('pending', 'active', 'revoked')),
  created_at timestamptz default now()
);

-- 8. Create private storage bucket for medical records
insert into storage.buckets (id, name, public)
values ('medical-records', 'medical-records', false)
on conflict (id) do nothing;

-- =============================================================================
-- Row Level Security (RLS) Policies
-- =============================================================================

alter table profiles enable row level security;
alter table documents enable row level security;
alter table pages enable row level security;
alter table items enable row level security;
alter table emergency_cards enable row level security;
alter table access_log enable row level security;
alter table family_members enable row level security;

-- Profiles Policies
drop policy if exists "profiles: owner select" on profiles;
create policy "profiles: owner select" on profiles for select using (id = auth.uid());

drop policy if exists "profiles: owner insert" on profiles;
create policy "profiles: owner insert" on profiles for insert with check (id = auth.uid());

drop policy if exists "profiles: owner update" on profiles;
create policy "profiles: owner update" on profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- Documents Policies
drop policy if exists "documents: owner select" on documents;
create policy "documents: owner select" on documents for select using (user_id = auth.uid());

drop policy if exists "documents: owner insert" on documents;
create policy "documents: owner insert" on documents for insert with check (user_id = auth.uid());

drop policy if exists "documents: owner update" on documents;
create policy "documents: owner update" on documents for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "documents: owner delete" on documents;
create policy "documents: owner delete" on documents for delete using (user_id = auth.uid());

-- Pages Policies
drop policy if exists "pages: owner select" on pages;
create policy "pages: owner select" on pages for select using (
  document_id in (select id from documents where user_id = auth.uid())
);

drop policy if exists "pages: owner insert" on pages;
create policy "pages: owner insert" on pages for insert with check (
  document_id in (select id from documents where user_id = auth.uid())
);

drop policy if exists "pages: owner delete" on pages;
create policy "pages: owner delete" on pages for delete using (
  document_id in (select id from documents where user_id = auth.uid())
);

-- Items Policies
drop policy if exists "items: owner select" on items;
create policy "items: owner select" on items for select using (user_id = auth.uid());

drop policy if exists "items: owner insert" on items;
create policy "items: owner insert" on items for insert with check (user_id = auth.uid());

drop policy if exists "items: owner update" on items;
create policy "items: owner update" on items for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "items: owner delete" on items;
create policy "items: owner delete" on items for delete using (user_id = auth.uid());

-- Emergency Cards Policies
drop policy if exists "emergency_cards: owner select" on emergency_cards;
create policy "emergency_cards: owner select" on emergency_cards for select using (user_id = auth.uid());

drop policy if exists "emergency_cards: owner insert" on emergency_cards;
create policy "emergency_cards: owner insert" on emergency_cards for insert with check (user_id = auth.uid());

drop policy if exists "emergency_cards: owner update" on emergency_cards;
create policy "emergency_cards: owner update" on emergency_cards for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "emergency_cards: owner delete" on emergency_cards;
create policy "emergency_cards: owner delete" on emergency_cards for delete using (user_id = auth.uid());

-- Access Log Policies
drop policy if exists "access_log: owner select" on access_log;
create policy "access_log: owner select" on access_log for select using (
  card_id in (select id from emergency_cards where user_id = auth.uid())
);

-- Family Members Policies
drop policy if exists "family_members: owner select" on family_members;
create policy "family_members: owner select" on family_members for select using (owner_id = auth.uid());

drop policy if exists "family_members: owner insert" on family_members;
create policy "family_members: owner insert" on family_members for insert with check (owner_id = auth.uid());

drop policy if exists "family_members: owner update" on family_members;
create policy "family_members: owner update" on family_members for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "family_members: owner delete" on family_members;
create policy "family_members: owner delete" on family_members for delete using (owner_id = auth.uid());

drop policy if exists "family_members: member select" on family_members;
create policy "family_members: member select" on family_members for select using (member_user_id = auth.uid());

-- Storage RLS Policies
drop policy if exists "storage: owner select" on storage.objects;
create policy "storage: owner select" on storage.objects for select using (
  bucket_id = 'medical-records' and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "storage: owner insert" on storage.objects;
create policy "storage: owner insert" on storage.objects for insert with check (
  bucket_id = 'medical-records' and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "storage: owner delete" on storage.objects;
create policy "storage: owner delete" on storage.objects for delete using (
  bucket_id = 'medical-records' and (storage.foldername(name))[1] = auth.uid()::text
);
