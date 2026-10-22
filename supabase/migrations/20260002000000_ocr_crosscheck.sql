-- Migration: Add OCR secondary reader and cross-check columns
-- Phase 3 Second-Reader Extension

-- 1. Add secondary OCR transcript column to pages
alter table pages
  add column if not exists ocr_text_secondary text;

-- 2. Add ocr_check payload and review_reason to items
alter table items
  add column if not exists ocr_check jsonb,
  add column if not exists review_reason text;

-- Comments explaining provenance and safety guarantees
comment on column pages.ocr_text_secondary is 'Independent second-reader OCR text (Tesseract.js) used for automated cross-checking against Gemini extraction.';
comment on column items.ocr_check is 'JSON payload capturing the second-reader verification state: agree, disagree, or unavailable, along with page confidence and matched/missing tokens.';
comment on column items.review_reason is 'Explanation for why an item was marked needs_review (e.g. OCR disagreement: dose).';
