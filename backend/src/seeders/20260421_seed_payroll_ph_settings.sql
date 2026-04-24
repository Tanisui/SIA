UPDATE payroll_settings_versions
SET is_active = 0,
    effective_to = CASE
      WHEN effective_from < '2026-01-01' THEN '2025-12-31'
      ELSE effective_to
    END,
    updated_at = CURRENT_TIMESTAMP
WHERE is_active = 1
  AND version_name <> 'Payroll V1 PH Statutory Baseline 2026';

UPDATE payroll_settings_versions
SET settings_json = JSON_SET(
      COALESCE(settings_json, JSON_OBJECT()),
      '$.night_differential_multiplier',
      0.1
    )
WHERE JSON_EXTRACT(settings_json, '$.night_differential_multiplier') IS NULL;

INSERT INTO payroll_settings_versions (
  version_name,
  effective_from,
  is_active,
  settings_json
)
SELECT
  'Payroll V1 PH Statutory Baseline 2026',
  '2026-01-01',
  1,
  '{
    "overtime_multiplier": 1.25,
    "night_differential_multiplier": 0.1,
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
  SELECT 1
  FROM payroll_settings_versions
  WHERE version_name = 'Payroll V1 PH Statutory Baseline 2026'
);
