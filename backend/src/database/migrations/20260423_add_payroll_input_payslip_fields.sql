ALTER TABLE payroll_inputs
  ADD COLUMN night_differential_minutes INT NOT NULL DEFAULT 0 AFTER overtime_hours;

ALTER TABLE payroll_inputs
  ADD COLUMN loan_deduction DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER manual_allowance;
