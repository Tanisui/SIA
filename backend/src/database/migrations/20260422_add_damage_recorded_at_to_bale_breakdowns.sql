-- Purpose: keep the exact time damaged bale breakdown units were encoded.

ALTER TABLE bale_breakdowns
  ADD COLUMN IF NOT EXISTS damage_recorded_at TIMESTAMP NULL AFTER damaged_items;
