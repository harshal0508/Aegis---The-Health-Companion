-- Rollback Migration for Patient Profiles Architecture (Feature B)
-- Reverts all changes made by 20260005000000_patient_profiles.sql.

-- 1. Drop document move log table
DROP TABLE IF EXISTS document_move_log CASCADE;

-- 2. Drop patient_id columns and foreign keys from documents, items, emergency_cards
ALTER TABLE emergency_cards DROP COLUMN IF EXISTS patient_id CASCADE;
ALTER TABLE items DROP COLUMN IF EXISTS patient_id CASCADE;
ALTER TABLE documents DROP COLUMN IF EXISTS patient_id CASCADE;

-- 3. Drop trigger and function enforcing 3-patient limit
DROP TRIGGER IF EXISTS enforce_patient_limit ON patients;
DROP FUNCTION IF EXISTS check_patient_limit();

-- 4. Drop patients table
DROP TABLE IF EXISTS patients CASCADE;

-- 5. Restore original owner-based RLS policies
DROP POLICY IF EXISTS "documents: account patient select" ON documents;
DROP POLICY IF EXISTS "documents: account patient insert" ON documents;
DROP POLICY IF EXISTS "documents: account patient update" ON documents;
DROP POLICY IF EXISTS "documents: account patient delete" ON documents;

CREATE POLICY "documents: owner select" ON documents FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "documents: owner insert" ON documents FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "documents: owner update" ON documents FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "documents: owner delete" ON documents FOR DELETE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "pages: account patient select" ON pages;
DROP POLICY IF EXISTS "pages: account patient insert" ON pages;
DROP POLICY IF EXISTS "pages: account patient delete" ON pages;

CREATE POLICY "pages: owner select" ON pages FOR SELECT USING (document_id IN (SELECT id FROM documents WHERE user_id = auth.uid()));
CREATE POLICY "pages: owner insert" ON pages FOR INSERT WITH CHECK (document_id IN (SELECT id FROM documents WHERE user_id = auth.uid()));
CREATE POLICY "pages: owner delete" ON pages FOR DELETE USING (document_id IN (SELECT id FROM documents WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "items: account patient select" ON items;
DROP POLICY IF EXISTS "items: account patient insert" ON items;
DROP POLICY IF EXISTS "items: account patient update" ON items;
DROP POLICY IF EXISTS "items: account patient delete" ON items;

CREATE POLICY "items: owner select" ON items FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "items: owner insert" ON items FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "items: owner update" ON items FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "items: owner delete" ON items FOR DELETE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "emergency_cards: account patient select" ON emergency_cards;
DROP POLICY IF EXISTS "emergency_cards: account patient insert" ON emergency_cards;
DROP POLICY IF EXISTS "emergency_cards: account patient update" ON emergency_cards;
DROP POLICY IF EXISTS "emergency_cards: account patient delete" ON emergency_cards;

CREATE POLICY "emergency_cards: owner select" ON emergency_cards FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "emergency_cards: owner insert" ON emergency_cards FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "emergency_cards: owner update" ON emergency_cards FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "emergency_cards: owner delete" ON emergency_cards FOR DELETE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "storage: account owner select" ON storage.objects;
DROP POLICY IF EXISTS "storage: account owner insert" ON storage.objects;
DROP POLICY IF EXISTS "storage: account owner delete" ON storage.objects;

CREATE POLICY "storage: owner select" ON storage.objects FOR SELECT USING (bucket_id = 'medical-records' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "storage: owner insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'medical-records' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "storage: owner delete" ON storage.objects FOR DELETE USING (bucket_id = 'medical-records' AND (storage.foldername(name))[1] = auth.uid()::text);
