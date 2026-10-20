-- Migration: Add sources column to items table to store verbatim multi-source provenance
-- Stores an array of { page_id, page_no, quote, confidence, verified }
alter table items add column if not exists sources jsonb default '[]'::jsonb;

-- Migration: Add doc_date_type to documents table ('discharge' | 'signed' | 'admission' | 'report' | 'unspecified')
alter table documents add column if not exists doc_date_type text;

