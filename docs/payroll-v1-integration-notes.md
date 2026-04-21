# Payroll V1 Integration Notes

## Migration and Seeding

Run `backend/src/database/migrations/20260421_create_payroll_tables.sql` before enabling the UI. Then run `backend/src/seeders/20260421_seed_payroll_permissions.sql` and `backend/src/seeders/20260421_seed_payroll_ph_settings.sql`, or rerun the main backend seed script after reviewing role grants.

Payroll V1 uses existing `users.id` as the employee identity. `payroll_profiles.user_id`, `payroll_inputs.user_id`, and `payroll_run_items.user_id` all point to `users.id`.

## Sample Requests

Create a payroll profile:

```json
POST /api/payroll/profiles
{
  "user_id": 12,
  "employment_type": "regular",
  "pay_basis": "monthly",
  "pay_rate": 18000,
  "payroll_frequency": "semi_monthly",
  "standard_work_days_per_month": 22,
  "standard_hours_per_day": 8,
  "payroll_method": "cash",
  "overtime_eligible": true,
  "late_deduction_enabled": true,
  "undertime_deduction_enabled": true,
  "tax_enabled": true,
  "sss_enabled": true,
  "philhealth_enabled": true,
  "pagibig_enabled": true
}
```

Create a semi-monthly period:

```json
POST /api/payroll/periods
{
  "code": "PAY-2026-04-A",
  "start_date": "2026-04-01",
  "end_date": "2026-04-15",
  "payout_date": "2026-04-16",
  "frequency": "semi_monthly",
  "notes": "First April cutoff"
}
```

Update one employee input row:

```json
PUT /api/payroll/periods/1/inputs/12
{
  "days_worked": 11,
  "hours_worked": 0,
  "overtime_hours": 2,
  "late_minutes": 15,
  "undertime_minutes": 0,
  "absent_days": 0,
  "regular_holiday_days": 0,
  "special_holiday_days": 1,
  "rest_day_days": 0,
  "manual_bonus": 500,
  "manual_commission": 0,
  "manual_allowance": 300,
  "manual_deduction": 0,
  "remarks": "Manual V1 input"
}
```

Compute and preview:

```json
POST /api/payroll/periods/1/compute
GET /api/payroll/periods/1/preview
```

Finalize and release:

```json
POST /api/payroll/runs/1/finalize
POST /api/payroll/runs/1/release
```

## Response Shape

Payroll preview returns the run header with computed employee items:

```json
{
  "id": 1,
  "payroll_period_id": 1,
  "run_number": "PAYRUN-PAY-2026-04-A-001",
  "status": "draft",
  "total_gross_pay": "18500.00",
  "total_employee_deductions": "1325.00",
  "total_net_pay": "17175.00",
  "employee_count": 1,
  "items": [
    {
      "id": 1,
      "user_id": 12,
      "gross_basic_pay": "9000.00",
      "gross_pay": "18500.00",
      "total_deductions": "1325.00",
      "net_pay": "17175.00",
      "payroll_profile_snapshot_json": {},
      "input_snapshot_json": {},
      "settings_snapshot_json": {},
      "lines": []
    }
  ]
}
```

## Important Behavior

Draft payroll runs can be recomputed. Recompute clears the previous draft run items and line breakdowns for the same draft run.

Finalized or released payroll periods cannot be recomputed or edited through payroll inputs. Finalized run items retain profile, input, and settings snapshots so future settings changes do not affect historical payslips.

The frontend never calculates payroll amounts. It submits inputs and displays values returned by the backend.

## Philippine Payroll Baseline

The default Payroll V1 settings use a Philippine private-employer baseline:

- SSS uses monthly compensation, configurable Monthly Salary Credit floor/cap/increment, a 15% total rate split 5% employee and 10% employer, and configurable EC amounts.
- PhilHealth uses monthly basic salary, 5% premium, employee/employer split, and configurable floor/cap.
- Pag-IBIG uses 2% employee and 2% employer shares with a configurable monthly compensation cap.
- Withholding tax uses configurable BIR RR 11-2018 Annex E brackets for weekly, semi-monthly, and monthly payroll periods.

These settings are versioned and snapshotted per finalized payroll run. Review the active settings before production use whenever SSS, PhilHealth, Pag-IBIG, or BIR issuances change.
