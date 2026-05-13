-- Seed permissions referenced in route guards but missing from the permissions table.
-- Uses INSERT IGNORE throughout so this is safe to re-run.

INSERT IGNORE INTO permissions (name, description) VALUES
  ('attendance.manage',    'Create, edit and delete attendance records for all employees'),
  ('attendance.create',    'Create attendance records'),
  ('attendance.view_own',  'View own attendance records'),
  ('payroll.input.update', 'Update payroll input sheet entries');

-- Manager: full attendance management + payroll input
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'Manager'
  AND p.name IN ('attendance.manage', 'attendance.create', 'attendance.view_own', 'payroll.input.update');

-- HR: full attendance management + payroll input
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'HR'
  AND p.name IN ('attendance.manage', 'attendance.create', 'attendance.view_own', 'payroll.input.update');

-- Sales Clerk, Inventory Clerk, Accountant, Auditor: view own only
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name IN ('Sales Clerk', 'Inventory Clerk', 'Accountant', 'Auditor', 'Supplier')
  AND p.name = 'attendance.view_own';
