-- Phase 1 RLS migration
-- Enables Row Level Security on every table and defines per-table policies.
-- Principle: users can only touch rows they own. Service role bypasses RLS.

-- ─── profiles ───────────────────────────────────────────────────────────────
alter table profiles enable row level security;

-- A user can only read and write their own profile row.
create policy "profiles: owner select"
  on profiles for select
  using (id = auth.uid());

create policy "profiles: owner insert"
  on profiles for insert
  with check (id = auth.uid());

create policy "profiles: owner update"
  on profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- ─── documents ──────────────────────────────────────────────────────────────
alter table documents enable row level security;

create policy "documents: owner select"
  on documents for select
  using (user_id = auth.uid());

create policy "documents: owner insert"
  on documents for insert
  with check (user_id = auth.uid());

create policy "documents: owner update"
  on documents for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "documents: owner delete"
  on documents for delete
  using (user_id = auth.uid());

-- ─── pages ──────────────────────────────────────────────────────────────────
alter table pages enable row level security;

-- Pages are owned transitively through documents. We check the parent document's
-- user_id rather than adding a redundant user_id column to the pages table.
create policy "pages: owner select"
  on pages for select
  using (
    document_id in (
      select id from documents where user_id = auth.uid()
    )
  );

create policy "pages: owner insert"
  on pages for insert
  with check (
    document_id in (
      select id from documents where user_id = auth.uid()
    )
  );

create policy "pages: owner delete"
  on pages for delete
  using (
    document_id in (
      select id from documents where user_id = auth.uid()
    )
  );

-- ─── items ──────────────────────────────────────────────────────────────────
alter table items enable row level security;

create policy "items: owner select"
  on items for select
  using (user_id = auth.uid());

create policy "items: owner insert"
  on items for insert
  with check (user_id = auth.uid());

create policy "items: owner update"
  on items for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "items: owner delete"
  on items for delete
  using (user_id = auth.uid());

-- ─── emergency_cards ────────────────────────────────────────────────────────
alter table emergency_cards enable row level security;

create policy "emergency_cards: owner select"
  on emergency_cards for select
  using (user_id = auth.uid());

create policy "emergency_cards: owner insert"
  on emergency_cards for insert
  with check (user_id = auth.uid());

create policy "emergency_cards: owner update"
  on emergency_cards for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "emergency_cards: owner delete"
  on emergency_cards for delete
  using (user_id = auth.uid());

-- ─── access_log ─────────────────────────────────────────────────────────────
alter table access_log enable row level security;

-- Users can VIEW their own card's access log (read-only audit trail).
-- INSERT is intentionally denied to all users — the service role inserts
-- log entries server-side so clients cannot forge access records.
create policy "access_log: owner select"
  on access_log for select
  using (
    card_id in (
      select id from emergency_cards where user_id = auth.uid()
    )
  );

-- ─── family_members ─────────────────────────────────────────────────────────
alter table family_members enable row level security;

-- The owner can fully manage their family member invitations.
create policy "family_members: owner select"
  on family_members for select
  using (owner_id = auth.uid());

create policy "family_members: owner insert"
  on family_members for insert
  with check (owner_id = auth.uid());

create policy "family_members: owner update"
  on family_members for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "family_members: owner delete"
  on family_members for delete
  using (owner_id = auth.uid());

-- An invited member can see their own invitation (to accept it in Phase N).
create policy "family_members: member select"
  on family_members for select
  using (member_user_id = auth.uid());

-- ─── Storage RLS ────────────────────────────────────────────────────────────
-- Storage bucket 'medical-records' is created in config.toml.
-- These policies ensure users can only access objects under their own user_id prefix.
-- The path convention is: {user_id}/{document_id}/page-{n}.jpg

create policy "storage: owner select"
  on storage.objects for select
  using (
    bucket_id = 'medical-records'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "storage: owner insert"
  on storage.objects for insert
  with check (
    bucket_id = 'medical-records'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "storage: owner delete"
  on storage.objects for delete
  using (
    bucket_id = 'medical-records'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
