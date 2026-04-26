-- Migration: "Only Admin can modify all accounts' attendance."
-- Other roles can only clock in/out for themselves and view their own records.
--
-- 1) Grant self-service perms (record + view_own) to every non-Admin/non-Supplier role.
-- 2) Revoke admin-tier attendance perms (view, manage) from every non-Admin role.
--    Admin keeps everything via 'admin.*'.

-- ── 1. Make sure the perms exist ─────────────────────────────────────
INSERT IGNORE INTO `permissions` (`name`, `description`) VALUES
  ('attendance.view',     'View all employee attendance'),
  ('attendance.view_own', 'View own attendance records'),
  ('attendance.record',   'Record / clock in-out own attendance'),
  ('attendance.manage',   'Manage attendance entries for any employee');

-- ── 2. Grant self-service perms to every non-Admin/non-Supplier role ──
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM `roles` r
CROSS JOIN `permissions` p
WHERE r.name NOT IN ('Admin', 'super_admin', 'Supplier')
  AND p.name IN ('attendance.record', 'attendance.view_own');

-- ── 3. Revoke admin-tier attendance perms from non-Admin roles ───────
DELETE rp
FROM `role_permissions` rp
JOIN `roles` r       ON r.id = rp.role_id
JOIN `permissions` p ON p.id = rp.permission_id
WHERE r.name NOT IN ('Admin', 'super_admin')
  AND p.name IN ('attendance.view', 'attendance.manage');
