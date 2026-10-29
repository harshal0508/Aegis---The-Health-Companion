-- Migration: Patient Profiles Architecture (Feature B)
-- Creates the patients table with a database-level hard limit of 3 profiles per account.
-- Adds patient_id to documents, items, and emergency_cards, and backfills existing rows to the Self patient.

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

-- 5. Add patient_id to documents, items, and emergency_cards
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS patient_id uuid REFERENCES patients(id) ON DELETE CASCADE;

ALTER TABLE items
ADD COLUMN IF NOT EXISTS patient_id uuid REFERENCES patients(id) ON DELETE CASCADE;

ALTER TABLE emergency_cards
ADD COLUMN IF NOT EXISTS patient_id uuid REFERENCES patients(id) ON DELETE CASCADE;

-- 6. Backfill existing profile rows into patients (as Self patient with matching id)
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

-- 7. Backfill patient_id for documents, items, and emergency_cards
UPDATE documents SET patient_id = user_id WHERE patient_id IS NULL;
UPDATE items SET patient_id = user_id WHERE patient_id IS NULL;
UPDATE emergency_cards SET patient_id = user_id WHERE patient_id IS NULL;

-- 8. Indices for performant multi-profile lookups
CREATE INDEX IF NOT EXISTS idx_patients_account ON patients(account_id);
CREATE INDEX IF NOT EXISTS idx_documents_patient ON documents(patient_id);
CREATE INDEX IF NOT EXISTS idx_items_patient ON items(patient_id);
CREATE INDEX IF NOT EXISTS idx_emergency_cards_patient ON emergency_cards(patient_id);

-- 9. Table to audit document transfers between profiles
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
CREATE POLICY "Users can view move log of their account"
ON document_move_log FOR SELECT
TO authenticated
USING (moved_by = auth.uid());

-- 10. Update RLS policies on tables to permit account access across all its patients
-- documents: account can access if user_id matches or patient_id belongs to account
DROP POLICY IF EXISTS "documents: owner select" ON documents;
DROP POLICY IF EXISTS "documents: owner insert" ON documents;
DROP POLICY IF EXISTS "documents: owner update" ON documents;
DROP POLICY IF EXISTS "documents: owner delete" ON documents;

CREATE POLICY "documents: account patient select"
  ON documents FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() OR
    patient_id IN (SELECT id FROM patients WHERE account_id = auth.uid())
  );

CREATE POLICY "documents: account patient insert"
  ON documents FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid() OR
    patient_id IN (SELECT id FROM patients WHERE account_id = auth.uid())
  );

CREATE POLICY "documents: account patient update"
  ON documents FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid() OR
    patient_id IN (SELECT id FROM patients WHERE account_id = auth.uid())
  )
  WITH CHECK (
    user_id = auth.uid() OR
    patient_id IN (SELECT id FROM patients WHERE account_id = auth.uid())
  );

CREATE POLICY "documents: account patient delete"
  ON documents FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid() OR
    patient_id IN (SELECT id FROM patients WHERE account_id = auth.uid())
  );

-- pages: access if document belongs to account
DROP POLICY IF EXISTS "pages: owner select" ON pages;
DROP POLICY IF EXISTS "pages: owner insert" ON pages;
DROP POLICY IF EXISTS "pages: owner delete" ON pages;

CREATE POLICY "pages: account patient select"
  ON pages FOR SELECT
  TO authenticated
  USING (
    document_id IN (
      SELECT id FROM documents
      WHERE user_id = auth.uid() OR
            patient_id IN (SELECT id FROM patients WHERE account_id = auth.uid())
    )
  );

CREATE POLICY "pages: account patient insert"
  ON pages FOR INSERT
  TO authenticated
  WITH CHECK (
    document_id IN (
      SELECT id FROM documents
      WHERE user_id = auth.uid() OR
            patient_id IN (SELECT id FROM patients WHERE account_id = auth.uid())
    )
  );

CREATE POLICY "pages: account patient delete"
  ON pages FOR DELETE
  TO authenticated
  USING (
    document_id IN (
      SELECT id FROM documents
      WHERE user_id = auth.uid() OR
            patient_id IN (SELECT id FROM patients WHERE account_id = auth.uid())
    )
  );

-- items: access if user_id matches or patient_id belongs to account
DROP POLICY IF EXISTS "items: owner select" ON items;
DROP POLICY IF EXISTS "items: owner insert" ON items;
DROP POLICY IF EXISTS "items: owner update" ON items;
DROP POLICY IF EXISTS "items: owner delete" ON items;

CREATE POLICY "items: account patient select"
  ON items FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() OR
    patient_id IN (SELECT id FROM patients WHERE account_id = auth.uid())
  );

CREATE POLICY "items: account patient insert"
  ON items FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid() OR
    patient_id IN (SELECT id FROM patients WHERE account_id = auth.uid())
  );

CREATE POLICY "items: account patient update"
  ON items FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid() OR
    patient_id IN (SELECT id FROM patients WHERE account_id = auth.uid())
  )
  WITH CHECK (
    user_id = auth.uid() OR
    patient_id IN (SELECT id FROM patients WHERE account_id = auth.uid())
  );

CREATE POLICY "items: account patient delete"
  ON items FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid() OR
    patient_id IN (SELECT id FROM patients WHERE account_id = auth.uid())
  );

-- emergency_cards: access if user_id matches or patient_id belongs to account
DROP POLICY IF EXISTS "emergency_cards: owner select" ON emergency_cards;
DROP POLICY IF EXISTS "emergency_cards: owner insert" ON emergency_cards;
DROP POLICY IF EXISTS "emergency_cards: owner update" ON emergency_cards;
DROP POLICY IF EXISTS "emergency_cards: owner delete" ON emergency_cards;

CREATE POLICY "emergency_cards: account patient select"
  ON emergency_cards FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() OR
    patient_id IN (SELECT id FROM patients WHERE account_id = auth.uid())
  );

CREATE POLICY "emergency_cards: account patient insert"
  ON emergency_cards FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid() OR
    patient_id IN (SELECT id FROM patients WHERE account_id = auth.uid())
  );

CREATE POLICY "emergency_cards: account patient update"
  ON emergency_cards FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid() OR
    patient_id IN (SELECT id FROM patients WHERE account_id = auth.uid())
  )
  WITH CHECK (
    user_id = auth.uid() OR
    patient_id IN (SELECT id FROM patients WHERE account_id = auth.uid())
  );

CREATE POLICY "emergency_cards: account patient delete"
  ON emergency_cards FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid() OR
    patient_id IN (SELECT id FROM patients WHERE account_id = auth.uid())
  );

-- storage.objects: paths are {account_id}/{patient_id}/{document_id}/page-n
-- (storage.foldername(name))[1] is account_id
DROP POLICY IF EXISTS "storage: owner select" ON storage.objects;
DROP POLICY IF EXISTS "storage: owner insert" ON storage.objects;
DROP POLICY IF EXISTS "storage: owner delete" ON storage.objects;

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

CREATE POLICY "storage: account owner delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'medical-records'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
