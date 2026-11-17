-- Migration: Add queued status, error_message, and reader_source tracking
-- Phase 3 Background Extraction & Resilient Queueing

-- 1. Update documents.status check constraint to support 'queued'
alter table documents
  drop constraint if exists documents_status_check;

alter table documents
  add constraint documents_status_check
  check (status in ('uploaded', 'queued', 'processing', 'ready', 'failed'));

-- 2. Add error_message and reader_source to documents
alter table documents
  add column if not exists error_message text,
  add column if not exists reader_source text,
  add column if not exists extracted_at timestamptz;

-- 3. Add reader_source column to items table
alter table items
  add column if not exists reader_source text default 'primary_vision';

-- Comments for documentation
comment on column documents.error_message is 'Clear human-readable error explanation if background extraction fails.';
comment on column documents.reader_source is 'The primary reader or fallback reader that successfully processed this document (e.g. primary_vision, fallback_vision, text_ocr_azure, text_ocr_tesseract).';
comment on column items.reader_source is 'The reader source that generated this specific extracted item (e.g. primary_vision, fallback_vision, text_ocr_azure, text_ocr_tesseract).';
