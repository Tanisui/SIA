const express = require('express')
const router = express.Router()
const { verifyToken, authorize } = require('../middleware/authMiddleware')
const payroll = require('../controllers/payroll.controller')

router.get(
  '/profiles',
  verifyToken,
  authorize(['payroll.view', 'payroll.profile.view']),
  payroll.listProfiles
)
router.post(
  '/profiles',
  express.json(),
  verifyToken,
  authorize(['payroll.profile.create']),
  payroll.createProfile
)
router.put(
  '/profiles/:id',
  express.json(),
  verifyToken,
  authorize(['payroll.profile.update']),
  payroll.updateProfile
)

router.get(
  '/periods',
  verifyToken,
  authorize(['payroll.view', 'payroll.period.view']),
  payroll.listPeriods
)
router.post(
  '/periods',
  express.json(),
  verifyToken,
  authorize(['payroll.period.create']),
  payroll.createPeriod
)
router.get(
  '/periods/:id',
  verifyToken,
  authorize(['payroll.view', 'payroll.period.view']),
  payroll.getPeriod
)
router.post(
  '/periods/:id/load-inputs',
  verifyToken,
  authorize(['payroll.period.compute']),
  payroll.loadInputs
)
router.put(
  '/periods/:id/inputs/:userId',
  express.json(),
  verifyToken,
  authorize(['payroll.period.compute']),
  payroll.updateInput
)
router.post(
  '/periods/:id/compute',
  verifyToken,
  authorize(['payroll.period.compute']),
  payroll.computePeriod
)
router.get(
  '/periods/:id/preview',
  verifyToken,
  authorize(['payroll.view', 'payroll.period.view', 'payroll.period.compute']),
  payroll.getPreview
)

router.post(
  '/runs/:id/finalize',
  verifyToken,
  authorize(['payroll.period.finalize']),
  payroll.finalize
)
router.post(
  '/runs/:id/release',
  verifyToken,
  authorize(['payroll.period.release']),
  payroll.release
)
router.post(
  '/runs/:id/void',
  express.json(),
  verifyToken,
  authorize(['payroll.period.void']),
  payroll.voidPayroll
)
router.get(
  '/runs/:id/items',
  verifyToken,
  authorize(['payroll.view', 'payroll.period.view']),
  payroll.getRunItems
)
router.get(
  '/runs/:id/items/:itemId/payslip',
  verifyToken,
  authorize(['payroll.payslip.view', 'payroll.payslip.view_own']),
  payroll.getPayslip
)

router.get(
  '/reports/register',
  verifyToken,
  authorize(['payroll.report.view']),
  payroll.getRegisterReport
)
router.get(
  '/reports/statutory-summary',
  verifyToken,
  authorize(['payroll.report.view']),
  payroll.getStatutoryReport
)
router.get(
  '/reports/employee-history',
  verifyToken,
  authorize(['payroll.report.view', 'payroll.payslip.view_own']),
  payroll.getEmployeeHistoryReport
)

router.get(
  '/settings',
  verifyToken,
  authorize(['payroll.settings.view']),
  payroll.getSettings
)
router.put(
  '/settings',
  express.json(),
  verifyToken,
  authorize(['payroll.settings.update']),
  payroll.updateSettings
)

module.exports = router
