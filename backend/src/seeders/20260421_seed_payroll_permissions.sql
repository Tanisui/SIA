INSERT IGNORE INTO permissions (name, description) VALUES
  ('payroll.view', 'View payroll module'),
  ('payroll.profile.view', 'View payroll profiles'),
  ('payroll.profile.create', 'Create payroll profiles'),
  ('payroll.profile.update', 'Update payroll profiles'),
  ('payroll.period.view', 'View payroll periods'),
  ('payroll.period.create', 'Create payroll periods'),
  ('payroll.period.compute', 'Compute payroll previews'),
  ('payroll.period.finalize', 'Finalize payroll runs'),
  ('payroll.period.release', 'Release payroll runs'),
  ('payroll.period.void', 'Void payroll runs'),
  ('payroll.settings.view', 'View payroll settings'),
  ('payroll.settings.update', 'Update payroll settings'),
  ('payroll.report.view', 'View payroll reports'),
  ('payroll.report.export', 'Export payroll reports'),
  ('payroll.payslip.view', 'View all employee payslips'),
  ('payroll.payslip.view_own', 'View own payslip');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.name IN (
  'payroll.view',
  'payroll.profile.view',
  'payroll.profile.create',
  'payroll.profile.update',
  'payroll.period.view',
  'payroll.period.create',
  'payroll.period.compute',
  'payroll.period.finalize',
  'payroll.period.release',
  'payroll.period.void',
  'payroll.settings.view',
  'payroll.settings.update',
  'payroll.report.view',
  'payroll.report.export',
  'payroll.payslip.view'
)
WHERE r.name IN ('Admin', 'Manager', 'Accountant');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.name IN (
  'payroll.view',
  'payroll.profile.view',
  'payroll.profile.create',
  'payroll.profile.update',
  'payroll.payslip.view_own'
)
WHERE r.name IN ('HR');
