-- Migration: Philippine payroll frequency and cutoff support (2026-05-09)
-- Adds true daily payroll periods, salary divisor support, and BIR daily withholding brackets.

ALTER TABLE `payroll_periods`
  MODIFY COLUMN `frequency` ENUM('daily','weekly','semi_monthly','monthly') NOT NULL DEFAULT 'semi_monthly';

ALTER TABLE `payroll_profiles`
  ADD COLUMN `salary_divisor` DECIMAL(8,2) NULL AFTER `standard_work_days_per_month`;

UPDATE `payroll_settings_versions`
SET `settings_json` = JSON_SET(
  `settings_json`,
  '$.withholding_tax.brackets.daily',
  JSON_ARRAY(
    JSON_OBJECT('from', 0, 'to', 685, 'base_tax', 0, 'excess_over', 0, 'rate', 0),
    JSON_OBJECT('from', 685, 'to', 1095, 'base_tax', 0, 'excess_over', 685, 'rate', 0.15),
    JSON_OBJECT('from', 1096, 'to', 2191, 'base_tax', 61.65, 'excess_over', 1096, 'rate', 0.20),
    JSON_OBJECT('from', 2192, 'to', 5478, 'base_tax', 280.85, 'excess_over', 2192, 'rate', 0.25),
    JSON_OBJECT('from', 5479, 'to', 21917, 'base_tax', 1102.60, 'excess_over', 5479, 'rate', 0.30),
    JSON_OBJECT('from', 21918, 'to', NULL, 'base_tax', 6034.30, 'excess_over', 21918, 'rate', 0.35)
  )
)
WHERE JSON_EXTRACT(`settings_json`, '$.withholding_tax.brackets.daily') IS NULL;
