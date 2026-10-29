-- Migration: Patient Profiles Architecture (Feature B)
-- Creates the patients table with a database-level hard limit of 3 profiles per account.
-- Strictly isolates access per account via (patient_id IN (SELECT id FROM patients WHERE account_id = auth.uid())).
-- Enforces NOT NULL on patient_id for documents, items, and emergency_cards after backfill.
-- Synchronizes items.patient_id to parent documents via database trigger.
-- Automatically provisions Self patient on new profile creation/onboarding.
-- Wrapped in a single transactional block (BEGIN ... COMMIT).

BEGIN;

-- 1. Create patients table
CREATE TABLE IF NOT EXISTS patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  dob date,
  blood_group text,
  emergency_contact_name text,
  emergency_contact_phone text,
  relationship_label text NOT NULL DEFAULT 'Self',
  is_self boolean NOT NULL DEFAULT false,
  permission_confirmed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- 2. Database-level limit: Maximum 3 patients per account (yourself plus two)
CREATE OR REPLACE FUNCTION check_patient_limit()
RETURNS TRIGGER AS $$
DECLARE
  current_count integer;
BEGIN
  SELECT count(*) INTO current_count
  FROM patients
  WHERE account_id = NEW.account_id;

  IF current_count >= 3 THEN
    RAISE EXCEPTION 'Maximum 3 patient profiles allowed per account (yourself plus two)';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_patient_limit ON patients;
CREATE TRIGGER enforce_patient_limit
BEFORE INSERT ON patients
FOR EACH ROW EXECUTE FUNCTION check_patient_limit();

-- 3. Only one 'self' profile permitted per account
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_self_patient_per_account
ON patients (account_id) WHERE is_self = true;

-- 4. Enable Row Level Security on patients table
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage patients of their account"
ON patients FOR ALL
TO authenticated
USING (account_id = auth.uid())
WITH CHECK (account_id = auth.uid());

-- 5. Trigger to automatically provision/sync Self patient from profiles (e.g. during onboarding)
CREATE OR REPLACE FUNCTION sync_self_patient_from_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO patients (
    id,
    account_id,
    full_name,
    dob,
    blood_group,
    emergency_contact_name,
    emergency_contact_phone,
    relationship_label,
    is_self,
    permission_confirmed_at
  )
  VALUES (
    NEW.id,
    NEW.id,
    NEW.full_name,
    NEW.dob,
    NEW.blood_group,
    NEW.emergency_contact_name,
    NEW.emergency_contact_phone,
    'Self',
    true,
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    dob = EXCLUDED.dob,
    blood_group = EXCLUDED.blood_group,
    emergency_contact_name = EXCLUDED.emergency_contact_name,
    emergency_contact_phone = EXCLUDED.emergency_contact_phone;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_profile_sync_self_patient ON profiles;
CREATE TRIGGER trg_profile_sync_self_patient
AFTER INSERT OR UPDATE ON profiles
FOR EACH ROW EXECUTE FUNCTION sync_self_patient_from_profile();

-- 6. Add patient_id to documents, items, and emergency_cards
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS patient_id uuid REFERENCES patients(id) ON DELETE CASCADE;

ALTER TABLE items
ADD COLUMN IF NOT EXISTS patient_id uuid REFERENCES patients(id) ON DELETE CASCADE;

ALTER TABLE emergency_cards
ADD COLUMN IF NOT EXISTS patient_id uuid REFERENCES patients(id) ON DELETE CASCADE;

-- 7. Backfill existing profile rows into patients (as Self patient with matching id)
INSERT INTO patients (
  id,
  account_id,
  full_name,
  dob,
  blood_group,
  emergency_contact_name,
  emergency_contact_phone,
  relationship_label,
  is_self,
  permission_confirmed_at
)
SELECT
  p.id,
  p.id,
  p.full_name,
  p.dob,
  p.blood_group,
  p.emergency_contact_name,
  p.emergency_contact_phone,
  'Self',
  true,
  now()
FROM profiles p
ON CONFLICT (id) DO NOTHING;

-- 8. Backfill patient_id for documents, items, and emergency_cards to Self patient
UPDATE documents SET patient_id = user_id WHERE patient_id IS NULL;
UPDATE items SET patient_id = user_id WHERE patient_id IS NULL;
UPDATE emergency_cards SET patient_id = user_id WHERE patient_id IS NULL;

-- 9. Check that no NULL patient_id values remain, then enforce NOT NULL
DO $$
DECLARE
  null_docs integer;
  null_items integer;
  null_cards integer;
BEGIN
  SELECT count(*) INTO null_docs FROM documents WHERE patient_id IS NULL;
  SELECT count(*) INTO null_items FROM items WHERE patient_id IS NULL;
  SELECT count(*) INTO null_cards FROM emergency_cards WHERE patient_id IS NULL;

  IF null_docs > 0 OR null_items > 0 OR null_cards > 0 THEN
    RAISE EXCEPTION 'Backfill validation failed: NULL patient_id found (documents: %, items: %, emergency_cards: %). Migration aborted.',
      null_docs, null_items, null_cards;
  END IF;
END $$;

ALTER TABLE documents ALTER COLUMN patient_id SET NOT NULL;
ALTER TABLE items ALTER COLUMN patient_id SET NOT NULL;
ALTER TABLE emergency_cards ALTER COLUMN patient_id SET NOT NULL;

-- 10. Triggers to keep items.patient_id strictly synchronized with parent documents
CREATE OR REPLACE FUNCTION sync_item_patient_from_document()
RETURNS TRIGGER AS $$
DECLARE
  doc_patient_id uuid;
BEGIN
  IF NEW.page_id IS NOT NULL THEN
    SELECT d.patient_id INTO doc_patient_id
    FROM pages p
    JOIN documents d ON d.id = p.document_id
    WHERE p.id = NEW.page_id;

    IF doc_patient_id IS NOT NULL THEN
      NEW.patient_id := doc_patient_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_item_patient_from_document ON items;
CREATE TRIGGER trg_sync_item_patient_from_document
BEFORE INSERT OR UPDATE OF page_id, patient_id ON items
FOR EACH ROW EXECUTE FUNCTION sync_item_patient_from_document();

-- Cascade document patient moves to linked items
CREATE OR REPLACE FUNCTION cascade_document_patient_to_items()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.patient_id IS DISTINCT FROM OLD.patient_id THEN
    UPDATE items
    SET patient_id = NEW.patient_id
    WHERE page_id IN (
      SELECT id FROM pages WHERE document_id = NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cascade_document_patient_to_items ON documents;
CREATE TRIGGER trg_cascade_document_patient_to_items
AFTER UPDATE OF patient_id ON documents
FOR EACH ROW EXECUTE FUNCTION cascade_document_patient_to_items();

-- 11. Indices for multi-profile lookups
CREATE INDEX IF NOT EXISTS idx_patients_account ON patients(account_id);
CREATE INDEX IF NOT EXISTS idx_documents_patient ON documents(patient_id);
CREATE INDEX IF NOT EXISTS idx_items_patient ON items(patient_id);
CREATE INDEX IF NOT EXISTS idx_emergency_cards_patient ON emergency_cards(patient_id);

-- 12. Table to audit document transfers between profiles
CREATE TABLE IF NOT EXISTS document_move_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  from_patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  to_patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  moved_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE document_move_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "document_move_log: select own"
ON document_move_log FOR SELECT
TO authenticated
USING (moved_by = auth.uid());

CREATE POLICY "document_move_log: insert own"
ON document_move_log FOR INSERT
TO authenticated
WITH CHECK (moved_by = auth.uid());

-- 13. Strict RLS policies: Drop the user_id OR shortcut entirely.
-- Users can only read rows belonging to their account's patients.
-- Inserts and updates must have user_id = auth.uid() AND patient_id belonging to the caller's account.

-- documents
DROP POLICY IF EXISTS "documents: owner select" ON documents;
DROP POLICY IF EXISTS "documents: owner insert" ON documents;
DROP POLICY IF EXISTS "documents: owner update" ON documents;
DROP POLICY IF EXISTS "documents: owner delete" ON documents;
DROP POLICY IF EXISTS "documents: account patient select" ON documents;
DROP POLICY IF EXISTS "documents: account patient insert" ON documents;
DROP POLICY IF EXISTS "documents: account patient update" ON documents;
DROP POLICY IF EXISTS "documents: account patient delete" ON documents;

CREATE POLICY "documents: account patient select"
  ON documents FOR SELECT
  TO authenticated
  USING (patient_id IN (SELECT id FROM patients WHERE account_id = auth.uid()));

CREATE POLICY "documents: account patient insert"
  ON documents FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND patient_id IN (SELECT id FROM patients WHERE account_id = auth.uid())
  );

CREATE POLICY "documents: account patient update"
  ON documents FOR UPDATE
  TO authenticated
  USING (patient_id IN (SELECT id FROM patients WHERE account_id = auth.uid()))
  WITH CHECK (
    user_id = auth.uid()
    AND patient_id IN (SELECT id FROM patients WHERE account_id = auth.uid())
  );

CREATE POLICY "documents: account patient delete"
  ON documents FOR DELETE
  TO authenticated
  USING (patient_id IN (SELECT id FROM patients WHERE account_id = auth.uid()));

-- pages: strictly transitively scoped via parent document's patient_id
DROP POLICY IF EXISTS "pages: owner select" ON pages;
DROP POLICY IF EXISTS "pages: owner insert" ON pages;
DROP POLICY IF EXISTS "pages: owner delete" ON pages;
DROP POLICY IF EXISTS "pages: account patient select" ON pages;
DROP POLICY IF EXISTS "pages: account patient insert" ON pages;
DROP POLICY IF EXISTS "pages: account patient delete" ON pages;

CREATE POLICY "pages: account patient select"
  ON pages FOR SELECT
  TO authenticated
  USING (
    document_id IN (
      SELECT id FROM documents
      WHERE patient_id IN (SELECT id FROM patients WHERE account_id = auth.uid())
    )
  );

CREATE POLICY "pages: account patient insert"
  ON pages FOR INSERT
  TO authenticated
  WITH CHECK (
    document_id IN (
      SELECT id FROM documents
      WHERE patient_id IN (SELECT id FROM patients WHERE account_id = auth.uid())
    )
  );

CREATE POLICY "pages: account patient delete"
  ON pages FOR DELETE
  TO authenticated
  USING (
    document_id IN (
      SELECT id FROM documents
      WHERE patient_id IN (SELECT id FROM patients WHERE account_id = auth.uid())
    )
  );

-- items
DROP POLICY IF EXISTS "items: owner select" ON items;
DROP POLICY IF EXISTS "items: owner insert" ON items;
DROP POLICY IF EXISTS "items: owner update" ON items;
DROP POLICY IF EXISTS "items: owner delete" ON items;
DROP POLICY IF EXISTS "items: account patient select" ON items;
DROP POLICY IF EXISTS "items: account patient insert" ON items;
DROP POLICY IF EXISTS "items: account patient update" ON items;
DROP POLICY IF EXISTS "items: account patient delete" ON items;

CREATE POLICY "items: account patient select"
  ON items FOR SELECT
  TO authenticated
  USING (patient_id IN (SELECT id FROM patients WHERE account_id = auth.uid()));

CREATE POLICY "items: account patient insert"
  ON items FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND patient_id IN (SELECT id FROM patients WHERE account_id = auth.uid())
  );

CREATE POLICY "items: account patient update"
  ON items FOR UPDATE
  TO authenticated
  USING (patient_id IN (SELECT id FROM patients WHERE account_id = auth.uid()))
  WITH CHECK (
    user_id = auth.uid()
    AND patient_id IN (SELECT id FROM patients WHERE account_id = auth.uid())
  );

CREATE POLICY "items: account patient delete"
  ON items FOR DELETE
  TO authenticated
  USING (patient_id IN (SELECT id FROM patients WHERE account_id = auth.uid()));

-- emergency_cards
DROP POLICY IF EXISTS "emergency_cards: owner select" ON emergency_cards;
DROP POLICY IF EXISTS "emergency_cards: owner insert" ON emergency_cards;
DROP POLICY IF EXISTS "emergency_cards: owner update" ON emergency_cards;
DROP POLICY IF EXISTS "emergency_cards: owner delete" ON emergency_cards;
DROP POLICY IF EXISTS "emergency_cards: account patient select" ON emergency_cards;
DROP POLICY IF EXISTS "emergency_cards: account patient insert" ON emergency_cards;
DROP POLICY IF EXISTS "emergency_cards: account patient update" ON emergency_cards;
DROP POLICY IF EXISTS "emergency_cards: account patient delete" ON emergency_cards;

CREATE POLICY "emergency_cards: account patient select"
  ON emergency_cards FOR SELECT
  TO authenticated
  USING (patient_id IN (SELECT id FROM patients WHERE account_id = auth.uid()));

CREATE POLICY "emergency_cards: account patient insert"
  ON emergency_cards FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND patient_id IN (SELECT id FROM patients WHERE account_id = auth.uid())
  );

CREATE POLICY "emergency_cards: account patient update"
  ON emergency_cards FOR UPDATE
  TO authenticated
  USING (patient_id IN (SELECT id FROM patients WHERE account_id = auth.uid()))
  WITH CHECK (
    user_id = auth.uid()
    AND patient_id IN (SELECT id FROM patients WHERE account_id = auth.uid())
  );

CREATE POLICY "emergency_cards: account patient delete"
  ON emergency_cards FOR DELETE
  TO authenticated
  USING (patient_id IN (SELECT id FROM patients WHERE account_id = auth.uid()));

-- storage.objects: paths are {account_id}/{patient_id}/{document_id}/page-n
-- Enable SELECT, INSERT, UPDATE (required for storage.move), and DELETE
DROP POLICY IF EXISTS "storage: owner select" ON storage.objects;
DROP POLICY IF EXISTS "storage: owner insert" ON storage.objects;
DROP POLICY IF EXISTS "storage: owner delete" ON storage.objects;
DROP POLICY IF EXISTS "storage: account owner select" ON storage.objects;
DROP POLICY IF EXISTS "storage: account owner insert" ON storage.objects;
DROP POLICY IF EXISTS "storage: account owner update" ON storage.objects;
DROP POLICY IF EXISTS "storage: account owner delete" ON storage.objects;

CREATE POLICY "storage: account owner select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'medical-records'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "storage: account owner insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'medical-records'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "storage: account owner update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'medical-records'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'medical-records'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "storage: account owner delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'medical-records'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

COMMIT;
