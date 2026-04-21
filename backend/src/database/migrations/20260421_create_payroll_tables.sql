CREATE TABLE IF NOT EXISTS payroll_profiles (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  branch_id BIGINT UNSIGNED NULL,
  employment_type VARCHAR(64) NULL,
  pay_basis ENUM('monthly','daily','hourly') NOT NULL,
  pay_rate DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  payroll_frequency ENUM('weekly','semi_monthly','monthly') NOT NULL DEFAULT 'semi_monthly',
  standard_work_days_per_month DECIMAL(8,2) NULL,
  standard_hours_per_day DECIMAL(8,2) NULL,
  overtime_eligible TINYINT(1) NOT NULL DEFAULT 1,
  late_deduction_enabled TINYINT(1) NOT NULL DEFAULT 1,
  undertime_deduction_enabled TINYINT(1) NOT NULL DEFAULT 1,
  tax_enabled TINYINT(1) NOT NULL DEFAULT 1,
  sss_enabled TINYINT(1) NOT NULL DEFAULT 1,
  philhealth_enabled TINYINT(1) NOT NULL DEFAULT 1,
  pagibig_enabled TINYINT(1) NOT NULL DEFAULT 1,
  payroll_method ENUM('cash','bank_transfer','ewallet') NOT NULL DEFAULT 'cash',
  bank_name VARCHAR(150) NULL,
  bank_account_name VARCHAR(180) NULL,
  bank_account_number VARCHAR(80) NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY ux_payroll_profiles_user (user_id),
  KEY idx_payroll_profiles_status (status),
  KEY idx_payroll_profiles_branch (branch_id),
  CONSTRAINT fk_payroll_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS payroll_periods (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  branch_id BIGINT UNSIGNED NULL,
  code VARCHAR(80) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  payout_date DATE NOT NULL,
  frequency ENUM('weekly','semi_monthly','monthly') NOT NULL DEFAULT 'semi_monthly',
  status ENUM('draft','computed','finalized','released','void') NOT NULL DEFAULT 'draft',
  notes TEXT NULL,
  created_by BIGINT UNSIGNED NULL,
  finalized_by BIGINT UNSIGNED NULL,
  released_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY ux_payroll_periods_code (code),
  KEY idx_payroll_periods_dates (start_date, end_date),
  KEY idx_payroll_periods_status (status),
  KEY idx_payroll_periods_branch (branch_id),
  CONSTRAINT fk_payroll_periods_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_payroll_periods_finalized_by FOREIGN KEY (finalized_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_payroll_periods_released_by FOREIGN KEY (released_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS payroll_inputs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  payroll_period_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  days_worked DECIMAL(8,2) NOT NULL DEFAULT 0,
  hours_worked DECIMAL(8,2) NOT NULL DEFAULT 0,
  overtime_hours DECIMAL(8,2) NOT NULL DEFAULT 0,
  late_minutes INT NOT NULL DEFAULT 0,
  undertime_minutes INT NOT NULL DEFAULT 0,
  absent_days DECIMAL(8,2) NOT NULL DEFAULT 0,
  regular_holiday_days DECIMAL(8,2) NOT NULL DEFAULT 0,
  special_holiday_days DECIMAL(8,2) NOT NULL DEFAULT 0,
  rest_day_days DECIMAL(8,2) NOT NULL DEFAULT 0,
  paid_leave_days DECIMAL(8,2) NOT NULL DEFAULT 0,
  unpaid_leave_days DECIMAL(8,2) NOT NULL DEFAULT 0,
  manual_bonus DECIMAL(12,2) NOT NULL DEFAULT 0,
  manual_commission DECIMAL(12,2) NOT NULL DEFAULT 0,
  manual_allowance DECIMAL(12,2) NOT NULL DEFAULT 0,
  manual_deduction DECIMAL(12,2) NOT NULL DEFAULT 0,
  remarks TEXT NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY ux_payroll_inputs_period_user (payroll_period_id, user_id),
  KEY idx_payroll_inputs_user (user_id),
  CONSTRAINT fk_payroll_inputs_period FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods(id) ON DELETE CASCADE,
  CONSTRAINT fk_payroll_inputs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_payroll_inputs_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_payroll_inputs_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS payroll_runs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  payroll_period_id BIGINT UNSIGNED NOT NULL,
  run_number VARCHAR(80) NOT NULL,
  status ENUM('draft','finalized','released','void') NOT NULL DEFAULT 'draft',
  total_gross_pay DECIMAL(14,2) NOT NULL DEFAULT 0,
  total_employee_deductions DECIMAL(14,2) NOT NULL DEFAULT 0,
  total_employer_contributions DECIMAL(14,2) NOT NULL DEFAULT 0,
  total_net_pay DECIMAL(14,2) NOT NULL DEFAULT 0,
  employee_count INT NOT NULL DEFAULT 0,
  created_by BIGINT UNSIGNED NULL,
  finalized_by BIGINT UNSIGNED NULL,
  released_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY ux_payroll_runs_run_number (run_number),
  KEY idx_payroll_runs_period (payroll_period_id),
  KEY idx_payroll_runs_status (status),
  CONSTRAINT fk_payroll_runs_period FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods(id) ON DELETE CASCADE,
  CONSTRAINT fk_payroll_runs_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_payroll_runs_finalized_by FOREIGN KEY (finalized_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_payroll_runs_released_by FOREIGN KEY (released_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS payroll_run_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  payroll_run_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  payroll_profile_snapshot_json JSON NOT NULL,
  input_snapshot_json JSON NOT NULL,
  settings_snapshot_json JSON NOT NULL,
  gross_basic_pay DECIMAL(12,2) NOT NULL DEFAULT 0,
  gross_overtime_pay DECIMAL(12,2) NOT NULL DEFAULT 0,
  gross_holiday_pay DECIMAL(12,2) NOT NULL DEFAULT 0,
  gross_rest_day_pay DECIMAL(12,2) NOT NULL DEFAULT 0,
  gross_bonus DECIMAL(12,2) NOT NULL DEFAULT 0,
  gross_commission DECIMAL(12,2) NOT NULL DEFAULT 0,
  gross_allowances DECIMAL(12,2) NOT NULL DEFAULT 0,
  gross_pay DECIMAL(12,2) NOT NULL DEFAULT 0,
  taxable_income DECIMAL(12,2) NOT NULL DEFAULT 0,
  withholding_tax DECIMAL(12,2) NOT NULL DEFAULT 0,
  employee_sss DECIMAL(12,2) NOT NULL DEFAULT 0,
  employer_sss DECIMAL(12,2) NOT NULL DEFAULT 0,
  ec_contribution DECIMAL(12,2) NOT NULL DEFAULT 0,
  employee_philhealth DECIMAL(12,2) NOT NULL DEFAULT 0,
  employer_philhealth DECIMAL(12,2) NOT NULL DEFAULT 0,
  employee_pagibig DECIMAL(12,2) NOT NULL DEFAULT 0,
  employer_pagibig DECIMAL(12,2) NOT NULL DEFAULT 0,
  other_deductions DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_deductions DECIMAL(12,2) NOT NULL DEFAULT 0,
  net_pay DECIMAL(12,2) NOT NULL DEFAULT 0,
  status ENUM('draft','finalized','released','void') NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY ux_payroll_run_items_run_user (payroll_run_id, user_id),
  KEY idx_payroll_run_items_user (user_id),
  CONSTRAINT fk_payroll_run_items_run FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE,
  CONSTRAINT fk_payroll_run_items_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS payroll_item_lines (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  payroll_run_item_id BIGINT UNSIGNED NOT NULL,
  line_type ENUM('earning','deduction','employer_share','info') NOT NULL,
  code VARCHAR(80) NOT NULL,
  label VARCHAR(180) NOT NULL,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  metadata_json JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_payroll_item_lines_item (payroll_run_item_id, sort_order),
  CONSTRAINT fk_payroll_item_lines_item FOREIGN KEY (payroll_run_item_id) REFERENCES payroll_run_items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS payroll_settings_versions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  version_name VARCHAR(120) NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  settings_json JSON NOT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_payroll_settings_active (is_active, effective_from),
  KEY idx_payroll_settings_effective (effective_from, effective_to),
  CONSTRAINT fk_payroll_settings_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO payroll_settings_versions (
  version_name,
  effective_from,
  is_active,
  settings_json
)
SELECT
  'Payroll V1 Default',
  CURDATE(),
  1,
  '{
    "overtime_multiplier": 1.25,
    "regular_holiday_multiplier": 2,
    "special_holiday_multiplier": 1.3,
    "rest_day_multiplier": 1.3,
    "late_deduction_method": "hourly_equivalent",
    "undertime_deduction_method": "hourly_equivalent",
    "sss": {
      "enabled": true,
      "basis": "monthly_compensation",
      "employee_rate": 0.05,
      "employer_rate": 0.10,
      "monthly_salary_credit_floor": 5000,
      "monthly_salary_credit_cap": 35000,
      "monthly_salary_credit_increment": 500,
      "min_employee_contribution": 0,
      "min_employer_contribution": 0,
      "ec_threshold": 14500,
      "ec_low_amount": 10,
      "ec_high_amount": 30
    },
    "philhealth": {
      "enabled": true,
      "basis": "monthly_basic_salary",
      "premium_rate": 0.05,
      "employee_share_rate": 0.5,
      "employer_share_rate": 0.5,
      "monthly_salary_floor": 10000,
      "monthly_salary_cap": 100000
    },
    "pagibig": {
      "enabled": true,
      "employee_rate": 0.02,
      "employer_rate": 0.02,
      "monthly_compensation_cap": 10000
    },
    "withholding_tax": {
      "enabled": true,
      "mode": "bir_rr_11_2018_annex_e_2023_onwards",
      "brackets": {
        "weekly": [
          { "from": 0, "to": 4808, "base_tax": 0, "excess_over": 0, "rate": 0 },
          { "from": 4808, "to": 7691, "base_tax": 0, "excess_over": 4808, "rate": 0.15 },
          { "from": 7692, "to": 15384, "base_tax": 432.60, "excess_over": 7692, "rate": 0.20 },
          { "from": 15385, "to": 38461, "base_tax": 1971.20, "excess_over": 15385, "rate": 0.25 },
          { "from": 38462, "to": 153845, "base_tax": 7740.45, "excess_over": 38462, "rate": 0.30 },
          { "from": 153846, "to": null, "base_tax": 42355.65, "excess_over": 153846, "rate": 0.35 }
        ],
        "semi_monthly": [
          { "from": 0, "to": 10417, "base_tax": 0, "excess_over": 0, "rate": 0 },
          { "from": 10417, "to": 16666, "base_tax": 0, "excess_over": 10417, "rate": 0.15 },
          { "from": 16667, "to": 33332, "base_tax": 937.50, "excess_over": 16667, "rate": 0.20 },
          { "from": 33333, "to": 83332, "base_tax": 4270.70, "excess_over": 33333, "rate": 0.25 },
          { "from": 83333, "to": 333332, "base_tax": 16770.70, "excess_over": 83333, "rate": 0.30 },
          { "from": 333333, "to": null, "base_tax": 91770.70, "excess_over": 333333, "rate": 0.35 }
        ],
        "monthly": [
          { "from": 0, "to": 20833, "base_tax": 0, "excess_over": 0, "rate": 0 },
          { "from": 20833, "to": 33332, "base_tax": 0, "excess_over": 20833, "rate": 0.15 },
          { "from": 33333, "to": 66666, "base_tax": 1875, "excess_over": 33333, "rate": 0.20 },
          { "from": 66667, "to": 166666, "base_tax": 8541.80, "excess_over": 66667, "rate": 0.25 },
          { "from": 166667, "to": 666666, "base_tax": 33541.80, "excess_over": 166667, "rate": 0.30 },
          { "from": 666667, "to": null, "base_tax": 183541.80, "excess_over": 666667, "rate": 0.35 }
        ]
      }
    }
  }'
WHERE NOT EXISTS (
  SELECT 1 FROM payroll_settings_versions WHERE is_active = 1
);
