-- Migration: Enforce "non-admin = payroll view-only, attendance manage"
-- ------------------------------------------------------------------
-- 1) Make sure every relevant payroll/attendance permission exists.
-- 2) Grant view-only payroll perms + attendance manage perms to all
--    non-Admin/non-Supplier roles.
-- 3) Revoke any payroll write perms previously granted to non-Admin roles.
--    Admin keeps full access via 'admin.*'.

-- ── 1. Ensure permissions exist (idempotent) ─────────────────────────
INSERT IGNORE INTO `permissions` (`name`, `description`) VALUES
  ('payroll.view',              'View payroll module'),
  ('payroll.profile.view',      'View payroll profiles'),
  ('payroll.period.view',       'View payroll periods'),
  ('payroll.settings.view',     'View payroll settings'),
  ('payroll.report.view',       'View payroll reports'),
  ('payroll.payslip.view',      'View all employee payslips'),
  ('payroll.payslip.view_own',  'View own payslip'),
  ('attendance.view',           'View attendance'),
  ('attendance.view_own',       'View own attendance records'),
  ('attendance.record',         'Record / manage attendance'),
  ('attendance.manage',         'Manage attendance entries');

-- ── 2. Grant payroll view-only perms to every non-Admin/non-Supplier role ──
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM `roles` r
CROSS JOIN `permissions` p
WHERE r.name NOT IN ('Admin', 'super_admin', 'Supplier')
  AND p.name IN (
    'payroll.view',
    'payroll.profile.view',
    'payroll.period.view',
    'payroll.settings.view',
    'payroll.report.view',
    'payroll.payslip.view',
    'payroll.payslip.view_own'
  );

-- ── 3. Grant attendance manage + view perms to every non-Admin/non-Supplier role ──
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM `roles` r
CROSS JOIN `permissions` p
WHERE r.name NOT IN ('Admin', 'super_admin', 'Supplier')
  AND p.name IN (
    'attendance.view',
    'attendance.view_own',
    'attendance.record',
    'attendance.manage'
  );

-- ── 4. Revoke payroll write perms from any non-Admin role ─────────────
--    This enforces "payroll = view only" for everyone except Admin.
DELETE rp
FROM `role_permissions` rp
JOIN `roles` r       ON r.id = rp.role_id
JOIN `permissions` p ON p.id = rp.permission_id
WHERE r.name NOT IN ('Admin', 'super_admin')
  AND p.name IN (
    'payroll.profile.create',
    'payroll.profile.update',
    'payroll.period.create',
    'payroll.period.compute',
    'payroll.period.finalize',
    'payroll.period.release',
    'payroll.period.void',
    'payroll.settings.update',
    'payroll.report.export',
    'payroll.process',
    'payroll.adjust',
    'payroll.export',
    'payroll.input.update'
  );
