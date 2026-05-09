-- Migration: Payroll industry standard fixes (2026-05-09)
-- 1. Ensure payroll.payslip.view_own permission exists and is granted to all non-admin roles
-- 2. Add employee_number column to payroll_profiles
-- 3. Seed shop_info into the active payroll settings version

-- ── 1. Ensure permission exists (idempotent) ────────────────────────────
INSERT IGNORE INTO `permissions` (`name`, `description`) VALUES
  ('payroll.payslip.view_own', 'View own payslip');

-- ── 2. Grant view_own to all non-admin roles (idempotent) ───────────────
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM `roles` r
CROSS JOIN `permissions` p
WHERE r.name NOT IN ('Admin', 'super_admin', 'Supplier')
  AND p.name = 'payroll.payslip.view_own';

-- ── 3. Add employee_number to payroll_profiles ──────────────────────────
ALTER TABLE `payroll_profiles`
  ADD COLUMN `employee_number` VARCHAR(32) NULL AFTER `user_id`;

ALTER TABLE `payroll_profiles`
  ADD UNIQUE KEY `ux_payroll_profiles_employee_number` (`employee_number`);

-- Auto-populate existing profiles with EMP-XXXX format
UPDATE `payroll_profiles`
  SET `employee_number` = CONCAT('EMP-', LPAD(`id`, 4, '0'))
  WHERE `employee_number` IS NULL;

-- ── 4. Seed shop_info into the active payroll settings version ───────────
UPDATE `payroll_settings_versions`
  SET `settings_json` = JSON_SET(`settings_json`,
    '$.shop_info', JSON_OBJECT(
      'name',    'Cecille''s N''Style',
      'address', '',
      'tin',     ''
    ))
  WHERE `is_active` = 1
    AND JSON_EXTRACT(`settings_json`, '$.shop_info') IS NULL;
