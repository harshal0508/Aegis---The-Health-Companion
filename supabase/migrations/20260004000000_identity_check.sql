-- Migration: Document Identity Check Schema (Feature A)
-- Adds patient identity verification metadata and attestation fields to documents table.

ALTER TABLE documents
ADD COLUMN IF NOT EXISTS patient_name_as_printed text,
ADD COLUMN IF NOT EXISTS patient_name_latin text,
ADD COLUMN IF NOT EXISTS patient_dob date,
ADD COLUMN IF NOT EXISTS identity_status text CHECK (identity_status IN ('match', 'mismatch', 'name_not_found')),
ADD COLUMN IF NOT EXISTS identity_details jsonb,
ADD COLUMN IF NOT EXISTS attestation_timestamp timestamptz,
ADD COLUMN IF NOT EXISTS attestation_type text CHECK (attestation_type IN ('name_not_found_attested', 'same_person_override')),
ADD COLUMN IF NOT EXISTS attestation_note text;

-- Index for identity status queries
CREATE INDEX IF NOT EXISTS idx_documents_identity_status ON documents(identity_status);
