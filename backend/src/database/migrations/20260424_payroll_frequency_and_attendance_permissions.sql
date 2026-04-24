-- Migration: Add payment_frequency to employees, add 'daily' to payroll_profiles frequency enum,
-- and add attendance.view_own permission for employee self-service

-- 1. Add payment_frequency column to employees table
ALTER TABLE `employees`
  ADD COLUMN `payment_frequency` ENUM('DAILY','WEEKLY','SEMI_MONTHLY','MONTHLY') DEFAULT NULL
  AFTER `pay_basis`;

-- 2. Alter payroll_profiles.payroll_frequency enum to include 'daily'
ALTER TABLE `payroll_profiles`
  MODIFY COLUMN `payroll_frequency` ENUM('daily','weekly','semi_monthly','monthly') NOT NULL DEFAULT 'semi_monthly';

-- 3. Add attendance.view_own permission (allows employees to view only their own records)
INSERT IGNORE INTO `permissions` (`name`, `description`)
VALUES ('attendance.view_own', 'View own attendance records');

-- 4. Grant attendance.view_own to ALL roles so every employee can view their own DTR.
--    The endpoint enforces employee-scoped access regardless of role.
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM `roles` r
CROSS JOIN `permissions` p
WHERE p.name = 'attendance.view_own'
  AND r.name != 'Supplier';

-- 5. Grant payroll.payslip.view_own to all non-admin/non-manager roles so employees
--    can see their own payslips.
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM `roles` r
CROSS JOIN `permissions` p
WHERE p.name = 'payroll.payslip.view_own'
  AND r.name NOT IN ('Admin', 'Supplier');

-- 6. Ensure inventory.receive is granted to Admin, Manager, and inventory-management roles.
--    Admin already gets everything via admin.*, this covers Manager + any inventory role.
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM `roles` r
CROSS JOIN `permissions` p
WHERE p.name = 'inventory.receive'
  AND r.name IN ('Admin', 'Manager', 'Inventory Clerk', 'store house manager');

-- 7. Grant payroll view permissions to Accountant and HR if those roles exist.
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM `roles` r
CROSS JOIN `permissions` p
WHERE r.name IN ('Accountant', 'HR')
  AND p.name IN (
    'payroll.view', 'payroll.profile.view', 'payroll.period.view',
    'payroll.report.view', 'payroll.payslip.view'
  );
