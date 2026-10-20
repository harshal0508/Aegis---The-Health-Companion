-- Phase 1 schema migration
-- Creates all 7 tables. RLS is enabled in the next migration file.
-- Storage bucket is created via config.toml (not SQL) to keep concerns separated.

-- ─── profiles ───────────────────────────────────────────────────────────────
-- One row per auth.users entry. Created during onboarding, not at signup,
-- so that users who abandon onboarding don't have an incomplete profile row.
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  dob date,
  blood_group text,
  emergency_contact_name text,
  emergency_contact_phone text,
  created_at timestamptz default now()
);

-- ─── documents ──────────────────────────────────────────────────────────────
-- Tracks each uploaded medical document. storage_path is the path inside the
-- 'medical-records' bucket following the convention {user_id}/{document_id}/page-{n}.jpg
create table documents (
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

-- ─── pages ──────────────────────────────────────────────────────────────────
-- One row per page of a document. ocr_text is populated by the extraction
-- pipeline (Phase 3) — NULL until then. Never log this column.
create table pages (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  page_no int not null,
  ocr_text text,  -- sensitive: never log, never expose in error messages
  created_at timestamptz default now()
);

-- ─── items ──────────────────────────────────────────────────────────────────
-- Medical facts extracted from pages or entered by the patient.
-- normalization_source tracks how the value was standardized so Phase 3
-- can display provenance to the patient.
create table items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  category text not null
    check (category in ('allergy', 'medication', 'condition', 'surgery', 'lab', 'implant')),
  value text not null,
  page_id uuid references pages(id) on delete set null,
  quote text,       -- exact verbatim text from the page that supports this item
  confidence numeric,
  source text not null default 'extracted'
    check (source in ('extracted', 'patient_entered')),
  status text not null default 'extracted'
    check (status in ('extracted', 'confirmed', 'needs_review')),
  -- Tracks how the raw value was mapped to a standard term.
  -- 'none' = not normalized; 'llm_inferred' = lowest confidence path.
  normalization_source text not null default 'none'
    check (normalization_source in ('none', 'brand_table', 'rxnorm', 'llm_inferred')),
  last_confirmed_at timestamptz,  -- set only when patient explicitly confirms
  created_at timestamptz default now()
);

-- ─── emergency_cards ────────────────────────────────────────────────────────
-- The token itself is NEVER stored — only its SHA-256 hash. This prevents
-- leaking the token even if the DB is compromised.
create table emergency_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  token_hash text not null unique,  -- SHA-256 of the 128-bit random token
  visible_categories text[] not null default array[]::text[],
  active boolean not null default true,
  created_at timestamptz default now()
);

-- ─── access_log ─────────────────────────────────────────────────────────────
-- Immutable audit trail. Inserts happen via service role only (no user insert policy).
-- ip_hash is a SHA-256 of the IP so we can detect abuse without storing PII.
create table access_log (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references emergency_cards(id) on delete cascade,
  accessed_at timestamptz default now(),
  ip_hash text,         -- SHA-256 of client IP — not raw IP
  user_agent text
);

-- ─── family_members ─────────────────────────────────────────────────────────
-- Created now so future migrations don't have gaps. Not used in Phase 1 UI.
create table family_members (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  member_user_id uuid references profiles(id) on delete set null,
  role text not null check (role in ('view', 'upload')),
  status text not null default 'pending'
    check (status in ('pending', 'active', 'revoked')),
  created_at timestamptz default now()
);
