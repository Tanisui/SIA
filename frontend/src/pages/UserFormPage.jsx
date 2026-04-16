import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import api from '../api/api.js'
import { ConfirmModal } from '../components/Modal.js'

const DOCUMENT_TYPES = [
  { type: 'PSA_BIRTH_CERTIFICATE', label: 'PSA Birth Certificate', required: true },
  { type: 'VALID_GOVERNMENT_ID', label: 'Valid Government ID', required: true },
  { type: 'TIN_PROOF_OR_BIR_1902', label: 'TIN Proof / BIR Form 1902', required: true },
  { type: 'SSS_PROOF', label: 'SSS Proof', required: true },
  { type: 'PHILHEALTH_PROOF', label: 'PhilHealth Proof', required: true },
  { type: 'PAGIBIG_PROOF', label: 'Pag-IBIG Proof', required: true },
  { type: 'NBI_CLEARANCE', label: 'NBI Clearance', required: true },
  { type: 'MARRIAGE_CERTIFICATE', label: 'Marriage Certificate', required: false },
  { type: 'DEPENDENT_BIRTH_CERTIFICATE', label: 'Dependent Birth Certificate', required: false },
  { type: 'ACR_WORK_PERMIT_PASSPORT', label: 'ACR / Work Permit / Passport', required: false },
  { type: 'MEDICAL_CERTIFICATE', label: 'Medical Certificate', required: false }
]

const PROFILE_SECTIONS = [
  { id: 'account', title: 'Account & Access', tone: 'Required now', note: 'Set the employee login identity and access group first.' },
  { id: 'employment', title: 'Employment', tone: 'Required now', note: 'Capture the employee assignment before completing the rest of the file.' },
  { id: 'personal', title: 'Personal Information', tone: 'Complete later', note: 'Keep legal identity and contact details ready for HR review.' },
  { id: 'compensation', title: 'Compensation', tone: 'Complete later', note: 'Pay setup can be finished once payroll details are available.' },
  { id: 'government', title: 'Government Numbers', tone: 'Complete later', note: 'Track statutory numbers without blocking the initial employee setup.' },
  { id: 'emergency', title: 'Emergency Contact', tone: 'Complete later', note: 'Keep one reachable contact on file for operational and safety use.' }
]

const DOCUMENT_STATUS_OPTIONS = [
  { value: 'NOT_SUBMITTED', label: 'Not submitted' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'VERIFIED', label: 'Verified' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'EXPIRED', label: 'Expired' }
]

const SECTION_FIELDS = {
  account: ['email', 'full_name', 'roles'],
  employment: ['position_title', 'hire_date', 'employment_status'],
  personal: ['birth_date', 'sex', 'mobile_number', 'present_address'],
  compensation: ['pay_basis', 'pay_rate', 'payroll_method', 'provider_name', 'account_name', 'account_number'],
  government: ['tin', 'sss_number', 'philhealth_pin', 'pagibig_mid'],
  emergency: ['emergency_contact_name', 'emergency_contact_relationship', 'emergency_contact_number']
}

const ALLOWED_EMPLOYMENT_TYPES = new Set(['REGULAR', 'PART_TIME'])

const DEFAULT_BANK_DETAILS = {
  provider_name: '',
  account_name: '',
  account_number: '',
  account_type: ''
}

const DEFAULT_FORM = {
  email: '',
  full_name: '',
  is_active: 1,
  roles: [],
  birth_date: '',
  sex: '',
  civil_status: '',
  nationality: 'Filipino',
  mobile_number: '',
  present_address: '',
  permanent_address: '',
  position_title: '',
  hire_date: '',
  employment_type: '',
  employment_status: 'ACTIVE',
  pay_basis: '',
  pay_rate: '',
  payroll_method: 'CASH',
  bank_details: { ...DEFAULT_BANK_DETAILS },
  tin: '',
  sss_number: '',
  philhealth_pin: '',
  pagibig_mid: '',
  emergency_contact_name: '',
  emergency_contact_relationship: '',
  emergency_contact_number: '',
  emergency_contact_address: ''
}

function cloneForm(formData = DEFAULT_FORM) {
  return {
    ...DEFAULT_FORM,
    ...formData,
    bank_details: {
      ...DEFAULT_BANK_DETAILS,
      ...(formData.bank_details || {})
    }
  }
}

function createDefaultDocument(definition) {
  return {
    id: null,
    document_type: definition.type,
    label: definition.label,
    required: definition.required,
    document_number: '',
    issuing_agency: '',
    issue_date: '',
    expiry_date: '',
    status: 'NOT_SUBMITTED',
    remarks: '',
    has_file: false,
    original_name: null,
    type: null,
    size: null,
    uploaded_at: null,
    download_url: null,
    pending_file: null,
    pending_file_name: '',
    marked_for_deletion: false
  }
}

function createDefaultDocuments() {
  return DOCUMENT_TYPES.map((definition) => createDefaultDocument(definition))
}

function mergeDocuments(rows = []) {
  const byType = new Map((rows || []).map((row) => [row.document_type, row]))
  return DOCUMENT_TYPES.map((definition) => {
    const existing = byType.get(definition.type)
    return {
      ...createDefaultDocument(definition),
      ...(existing || {}),
      required: definition.required,
      label: definition.label,
      pending_file: null,
      pending_file_name: '',
      marked_for_deletion: false
    }
  })
}

function sanitizeFormForDirty(formData) {
  return {
    ...formData,
    bank_details: {
      provider_name: formData.bank_details?.provider_name || '',
      account_name: formData.bank_details?.account_name || '',
      account_number: formData.bank_details?.account_number || '',
      account_type: formData.bank_details?.account_type || ''
    }
  }
}

function sanitizeDocumentsForDirty(rows = []) {
  return rows.map((row) => ({
    document_type: row.document_type,
    document_number: row.document_number || '',
    issuing_agency: row.issuing_agency || '',
    issue_date: row.issue_date || '',
    expiry_date: row.expiry_date || '',
    status: row.status || 'NOT_SUBMITTED',
    remarks: row.remarks || '',
    has_file: Boolean(row.has_file),
    original_name: row.original_name || '',
    pending_file_name: row.pending_file_name || '',
    marked_for_deletion: Boolean(row.marked_for_deletion)
  }))
}

function hasText(value) {
  return Boolean(String(value ?? '').trim())
}

function hasDocumentFile(row) {
  return Boolean(row.has_file || row.pending_file)
}

function isValidMobileNumber(value) {
  return /^(09\d{9}|\+639\d{9})$/.test(String(value || '').trim())
}

function isPositiveRate(value) {
  if (value === '' || value === null || value === undefined) return false
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0
}

function formatCurrency(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return '-'
  return `PHP ${numeric.toFixed(2)}`
}

function formatFileSize(size) {
  const numeric = Number(size)
  if (!Number.isFinite(numeric) || numeric <= 0) return ''
  if (numeric >= 1024 * 1024) return `${(numeric / (1024 * 1024)).toFixed(1)} MB`
  if (numeric >= 1024) return `${(numeric / 1024).toFixed(1)} KB`
  return `${numeric} B`
}

function getCurrentStep(isEdit, search) {
  if (!isEdit) return 'profile'
  const step = new URLSearchParams(search).get('step')
  return step === 'documents' ? 'documents' : 'profile'
}

function getSectionCompletion(formData) {
  return {
    account: hasText(formData.email) && hasText(formData.full_name) && Array.isArray(formData.roles) && formData.roles.length > 0,
    employment: hasText(formData.position_title) && hasText(formData.hire_date) && hasText(formData.employment_status),
    personal: hasText(formData.birth_date) && hasText(formData.sex) && isValidMobileNumber(formData.mobile_number) && hasText(formData.present_address),
    compensation: hasText(formData.pay_basis)
      && isPositiveRate(formData.pay_rate)
      && hasText(formData.payroll_method)
      && (
        formData.payroll_method === 'CASH'
        || (
          hasText(formData.bank_details?.provider_name)
          && hasText(formData.bank_details?.account_name)
          && hasText(formData.bank_details?.account_number)
        )
      ),
    government: ['tin', 'sss_number', 'philhealth_pin', 'pagibig_mid'].every((key) => hasText(formData[key])),
    emergency: hasText(formData.emergency_contact_name)
      && hasText(formData.emergency_contact_relationship)
      && hasText(formData.emergency_contact_number)
  }
}

function getDefaultOpenSection(formData, isEdit) {
  if (!isEdit) return 'account'
  const completion = getSectionCompletion(formData)
  return PROFILE_SECTIONS.find((section) => !completion[section.id])?.id || 'account'
}

function normalizeSingleRoleSelection(roles) {
  if (!Array.isArray(roles) || !roles.length) return []
  const [first] = roles
  return first ? [String(first)] : []
}

function normalizeEmploymentType(value) {
  const normalized = String(value || '').trim().toUpperCase()
  return ALLOWED_EMPLOYMENT_TYPES.has(normalized) ? normalized : ''
}

function getCredentialsCacheKey(userId) {
  return `user-form-saved-credentials:${userId}`
}

function saveCredentialsSnapshot(userId, formData) {
  if (!userId || typeof window === 'undefined') return

  const snapshot = {
    email: String(formData.email || '').trim(),
    full_name: String(formData.full_name || '').trim(),
    roles: normalizeSingleRoleSelection(formData.roles),
    is_active: formData.is_active === 0 ? 0 : 1
  }

  window.sessionStorage.setItem(getCredentialsCacheKey(userId), JSON.stringify(snapshot))
}

function loadCredentialsSnapshot(userId) {
  if (!userId || typeof window === 'undefined') return null

  const raw = window.sessionStorage.getItem(getCredentialsCacheKey(userId))
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw)
    return {
      email: String(parsed?.email || '').trim(),
      full_name: String(parsed?.full_name || '').trim(),
      roles: normalizeSingleRoleSelection(parsed?.roles),
      is_active: parsed?.is_active === 0 ? 0 : 1
    }
  } catch (err) {
    return null
  }
}

function getDocumentStatusLabel(status) {
  return DOCUMENT_STATUS_OPTIONS.find((option) => option.value === status)?.label || status
}

function getDocumentStatusClass(status) {
  return `user-document-status user-document-status-${String(status || 'NOT_SUBMITTED').toLowerCase().replace(/_/g, '-')}`
}

export default function UserFormPage({ mode = 'create' }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { id } = useParams()
  const isEdit = mode === 'edit'
  const fileInputRefs = useRef({})

  const [rolesOptions, setRolesOptions] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState(cloneForm(DEFAULT_FORM))
  const [originalForm, setOriginalForm] = useState(cloneForm(DEFAULT_FORM))
  const [documents, setDocuments] = useState(createDefaultDocuments())
  const [originalDocuments, setOriginalDocuments] = useState(createDefaultDocuments())
  const [hasEmployeeRecord, setHasEmployeeRecord] = useState(Boolean(isEdit))
  const [error, setError] = useState(location.state?.flashError || null)
  const [success, setSuccess] = useState(location.state?.flashSuccess || null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [openSection, setOpenSection] = useState(isEdit ? null : 'account')
  const [expandedDocumentType, setExpandedDocumentType] = useState(null)
  const [openSaveConfirm, setOpenSaveConfirm] = useState(false)
  const [openCancelConfirm, setOpenCancelConfirm] = useState(false)
  const [openDeleteConfirm, setOpenDeleteConfirm] = useState(false)

  const currentStep = useMemo(() => getCurrentStep(isEdit, location.search), [isEdit, location.search])
  const basePath = isEdit ? `/users/${id}/edit` : '/users/new'

  useEffect(() => {
    let mounted = true

    const fetchRoles = async () => {
      try {
        const res = await api.get('/roles')
        if (!mounted) return
        const opts = (res.data || []).map((role) => ({ value: String(role.id), label: role.name }))
        setRolesOptions(opts)
      } catch (err) {
        if (!mounted) return
        setError('Failed to fetch roles')
      }
    }

    fetchRoles()
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (!isEdit || !id) {
      setLoading(false)
      setHasEmployeeRecord(false)
      setOpenSection('account')
      return
    }

    let mounted = true

    const fetchUser = async () => {
      setLoading(true)
      try {
        const res = await api.get(`/users/${id}`)
        if (!mounted) return

        const user = res.data || {}
        const employee = user.employee || {}
        const roleIds = []

        for (const roleName of user.roles || []) {
          const match = rolesOptions.find((role) => String(role.label) === String(roleName))
          if (match) {
            roleIds.push(String(match.value))
            break
          }
        }

        const nextForm = cloneForm({
          email: user.email || '',
          full_name: user.full_name || '',
          is_active: user.is_active === 0 ? 0 : 1,
          roles: normalizeSingleRoleSelection(roleIds),
          birth_date: employee.birth_date || '',
          sex: employee.sex || '',
          civil_status: employee.civil_status || '',
          nationality: employee.nationality || 'Filipino',
          mobile_number: employee.mobile_number || employee.contact || '',
          present_address: employee.present_address || '',
          permanent_address: employee.permanent_address || '',
          position_title: employee.position_title || '',
          hire_date: employee.hire_date || '',
          employment_type: normalizeEmploymentType(employee.employment_type),
          employment_status: employee.employment_status || 'ACTIVE',
          pay_basis: employee.pay_basis || '',
          pay_rate: employee.pay_rate || '',
          payroll_method: employee.payroll_method || 'CASH',
          bank_details: {
            ...DEFAULT_BANK_DETAILS,
            ...(employee.bank_details || {})
          },
          tin: employee.tin || '',
          sss_number: employee.sss_number || '',
          philhealth_pin: employee.philhealth_pin || '',
          pagibig_mid: employee.pagibig_mid || '',
          emergency_contact_name: employee.emergency_contact_name || '',
          emergency_contact_relationship: employee.emergency_contact_relationship || '',
          emergency_contact_number: employee.emergency_contact_number || '',
          emergency_contact_address: employee.emergency_contact_address || ''
        })

        const credentialsSnapshot = loadCredentialsSnapshot(id)
        const hydratedForm = credentialsSnapshot
          ? cloneForm({
              ...nextForm,
              email: credentialsSnapshot.email || nextForm.email,
              full_name: credentialsSnapshot.full_name || nextForm.full_name,
              is_active: credentialsSnapshot.is_active,
              roles: normalizeSingleRoleSelection(credentialsSnapshot.roles).length
                ? normalizeSingleRoleSelection(credentialsSnapshot.roles)
                : nextForm.roles
            })
          : nextForm

        const nextDocuments = mergeDocuments(employee.documents || [])
        setFormData(hydratedForm)
        setOriginalForm(cloneForm(hydratedForm))
        setDocuments(nextDocuments)
        setOriginalDocuments(nextDocuments)
        setHasEmployeeRecord(Boolean(user.employee))
        setOpenSection(getDefaultOpenSection(hydratedForm, true))
      } catch (err) {
        if (!mounted) return
        setError(err?.response?.data?.error || 'Failed to load user')
      } finally {
        if (mounted) setLoading(false)
      }
    }

    fetchUser()
    return () => {
      mounted = false
    }
  }, [id, isEdit, rolesOptions])

  const sectionCompletion = useMemo(() => getSectionCompletion(formData), [formData])
  const starterSectionsComplete = useMemo(
    () => Boolean(sectionCompletion.account && sectionCompletion.employment),
    [sectionCompletion]
  )
  const allProfileSectionsComplete = useMemo(
    () => PROFILE_SECTIONS.every((section) => Boolean(sectionCompletion[section.id])),
    [sectionCompletion]
  )

  const documentsByGroup = useMemo(() => ({
    required: documents.filter((row) => row.required),
    optional: documents.filter((row) => !row.required)
  }), [documents])

  const documentStats = useMemo(() => {
    const requiredRows = documents.filter((row) => row.required)
    return {
      requiredUploaded: requiredRows.filter((row) => hasDocumentFile(row)).length,
      requiredTotal: requiredRows.length,
      verifiedCount: documents.filter((row) => row.status === 'VERIFIED').length
    }
  }, [documents])

  const isProfileDirty = useMemo(() => {
    return JSON.stringify(sanitizeFormForDirty(formData)) !== JSON.stringify(sanitizeFormForDirty(originalForm))
  }, [formData, originalForm])

  const areDocumentsDirty = useMemo(() => {
    return JSON.stringify(sanitizeDocumentsForDirty(documents)) !== JSON.stringify(sanitizeDocumentsForDirty(originalDocuments))
  }, [documents, originalDocuments])

  const isDirty = isProfileDirty || areDocumentsDirty
  const documentsEnabled = Boolean(isEdit && hasEmployeeRecord)

  const handleStepChange = (step) => {
    if (step === 'documents' && !documentsEnabled) return
    setError(null)
    setSuccess(null)
    navigate(`${basePath}?step=${step}`)
  }

  const clearFieldError = (fieldName) => {
    setFieldErrors((prev) => ({ ...prev, [fieldName]: null }))
  }

  const handleInputChange = (event) => {
    const { name, value } = event.target
    clearFieldError(name)
    setError(null)
    setSuccess(null)

    if (name === 'roles') {
      setFormData((prev) => ({ ...prev, roles: value ? [String(value)] : [] }))
      return
    }

    if (name === 'is_active') {
      setFormData((prev) => ({ ...prev, is_active: value === '1' ? 1 : 0 }))
      return
    }

    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleBankDetailChange = (event) => {
    const { name, value } = event.target
    clearFieldError(name)
    setError(null)
    setSuccess(null)
    setFormData((prev) => ({
      ...prev,
      bank_details: {
        ...prev.bank_details,
        [name]: value
      }
    }))
  }

  const updateDocumentRow = (documentType, updater) => {
    setDocuments((prev) => prev.map((row) => {
      if (row.document_type !== documentType) return row
      return typeof updater === 'function' ? updater(row) : { ...row, ...updater }
    }))
  }

  const handleDocumentInputChange = (documentType, field, value) => {
    clearFieldError(`document:${documentType}`)
    setError(null)
    setSuccess(null)
    updateDocumentRow(documentType, (row) => ({
      ...row,
      [field]: value,
      marked_for_deletion: false
    }))
  }

  const handleDocumentFileChange = (documentType, file) => {
    if (!file) return
    clearFieldError(`document:${documentType}`)
    setError(null)
    setSuccess(null)
    updateDocumentRow(documentType, (row) => ({
      ...row,
      pending_file: file,
      pending_file_name: file.name,
      marked_for_deletion: false
    }))
  }

  const handleDocumentRemove = (documentType) => {
    const definition = DOCUMENT_TYPES.find((item) => item.type === documentType)
    if (!definition) return

    clearFieldError(`document:${documentType}`)
    setError(null)
    setSuccess(null)
    updateDocumentRow(documentType, (row) => ({
      ...createDefaultDocument(definition),
      id: row.id,
      marked_for_deletion: Boolean(row.id)
    }))
  }

  const handleDownloadDocument = async (row) => {
    if (!row.download_url) return
    try {
      const response = await api.get(row.download_url, { responseType: 'blob' })
      const blobUrl = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = row.original_name || `${row.label}.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(blobUrl)
    } catch (err) {
      setError('Failed to download document')
    }
  }

  const validateProfileForm = () => {
    const nextErrors = {}
    const governmentIdPattern = /^[0-9-]+$/

    if (!hasText(formData.email)) nextErrors.email = 'Email is required'
    if (!hasText(formData.full_name)) nextErrors.full_name = 'Full name is required'
    if (!Array.isArray(formData.roles) || !formData.roles.length) nextErrors.roles = 'Select a role'
    if (!hasText(formData.position_title)) nextErrors.position_title = 'Position title is required'
    if (!hasText(formData.hire_date)) nextErrors.hire_date = 'Hire date is required'
    if (!hasText(formData.employment_status)) nextErrors.employment_status = 'Employment status is required'

    if (hasText(formData.mobile_number) && !isValidMobileNumber(formData.mobile_number)) {
      nextErrors.mobile_number = 'Use 09xxxxxxxxx or +639xxxxxxxxx'
    }

    if (String(formData.pay_rate || '').trim() && !isPositiveRate(formData.pay_rate)) {
      nextErrors.pay_rate = 'Pay rate must be greater than 0'
    }

    for (const fieldName of ['tin', 'sss_number', 'philhealth_pin', 'pagibig_mid']) {
      const raw = String(formData[fieldName] || '').trim()
      if (raw && !governmentIdPattern.test(raw)) {
        nextErrors[fieldName] = 'Use digits and hyphens only'
      }
    }

    setFieldErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const validateDocuments = () => {
    const nextErrors = {}

    for (const row of documents) {
      if (row.marked_for_deletion) continue
      if (row.status === 'VERIFIED' && !hasDocumentFile(row)) {
        nextErrors[`document:${row.document_type}`] = `${row.label} must have a file before it can be verified`
      }
    }

    setFieldErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const buildPayload = () => ({
    email: String(formData.email || '').trim(),
    full_name: String(formData.full_name || '').trim(),
    is_active: formData.is_active,
    roles: normalizeSingleRoleSelection(formData.roles),
    birth_date: formData.birth_date || null,
    sex: formData.sex || null,
    civil_status: formData.civil_status || null,
    nationality: formData.nationality || null,
    mobile_number: String(formData.mobile_number || '').trim() || null,
    present_address: formData.present_address || null,
    permanent_address: formData.permanent_address || null,
    position_title: formData.position_title || null,
    hire_date: formData.hire_date || null,
    employment_type: normalizeEmploymentType(formData.employment_type) || null,
    employment_status: formData.employment_status || 'ACTIVE',
    pay_basis: formData.pay_basis || null,
    pay_rate: formData.pay_rate === '' ? null : Number(formData.pay_rate),
    payroll_method: formData.payroll_method || null,
    bank_details: (formData.payroll_method === 'BANK_TRANSFER' || formData.payroll_method === 'E_WALLET')
      ? {
          provider_name: formData.bank_details?.provider_name || null,
          account_name: formData.bank_details?.account_name || null,
          account_number: formData.bank_details?.account_number || null,
          account_type: formData.bank_details?.account_type || null
        }
      : null,
    tin: String(formData.tin || '').trim() || null,
    sss_number: String(formData.sss_number || '').trim() || null,
    philhealth_pin: String(formData.philhealth_pin || '').trim() || null,
    pagibig_mid: String(formData.pagibig_mid || '').trim() || null,
    emergency_contact_name: formData.emergency_contact_name || null,
    emergency_contact_relationship: formData.emergency_contact_relationship || null,
    emergency_contact_number: String(formData.emergency_contact_number || '').trim() || null,
    emergency_contact_address: formData.emergency_contact_address || null
  })

  const syncDocuments = async (userId) => {
    const originalMap = new Map(originalDocuments.map((row) => [row.document_type, row]))
    let changed = false

    for (const row of documents) {
      const original = originalMap.get(row.document_type) || createDefaultDocument({ type: row.document_type, label: row.label, required: row.required })
      const rowChanged = JSON.stringify(sanitizeDocumentsForDirty([row])[0]) !== JSON.stringify(sanitizeDocumentsForDirty([original])[0])

      if (!rowChanged) continue
      changed = true

      if (row.marked_for_deletion && row.id) {
        await api.delete(`/users/${userId}/documents/${row.id}`)
        continue
      }

      if (row.marked_for_deletion) continue

      const uploadForm = new FormData()
      uploadForm.append('document_type', row.document_type)
      uploadForm.append('document_number', row.document_number || '')
      uploadForm.append('issuing_agency', row.issuing_agency || '')
      uploadForm.append('issue_date', row.issue_date || '')
      uploadForm.append('expiry_date', row.expiry_date || '')
      uploadForm.append('status', row.status || 'NOT_SUBMITTED')
      uploadForm.append('remarks', row.remarks || '')
      if (row.pending_file) {
        uploadForm.append('file', row.pending_file)
      }

      await api.post(`/users/${userId}/documents`, uploadForm, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
    }

    return changed
  }

  const reloadDocuments = async (userId) => {
    const response = await api.get(`/users/${userId}/documents`)
    const nextDocuments = mergeDocuments(response.data || [])
    setDocuments(nextDocuments)
    setOriginalDocuments(nextDocuments)
  }

  const saveProfile = async () => {
    if (saving) return
    setError(null)
    setSuccess(null)

    if (!validateProfileForm()) {
      setError('Please complete the required starter fields before saving.')
      setOpenSaveConfirm(false)
      return
    }

    setSaving(true)

    try {
      const payload = buildPayload()

      if (isEdit) {
        await api.put(`/users/${id}`, payload)
        saveCredentialsSnapshot(id, formData)
        setOriginalForm(cloneForm(formData))
        setHasEmployeeRecord(true)
        setSuccess('Profile saved.')
      } else {
        const response = await api.post('/users', payload)
        const createdUserId = response.data?.id
        saveCredentialsSnapshot(createdUserId, formData)
        navigate(`/users/${createdUserId}/edit?step=documents`, {
          replace: true,
          state: { flashSuccess: 'Profile saved. Continue with documents.' }
        })
        return
      }
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to save profile')
    } finally {
      setSaving(false)
      setOpenSaveConfirm(false)
    }
  }

  const saveDocuments = async () => {
    if (!isEdit || saving) return
    if (!documentsEnabled) {
      setError('Save the employee profile first before managing documents.')
      setOpenSaveConfirm(false)
      return
    }

    setError(null)
    setSuccess(null)

    if (!validateDocuments()) {
      setError('Please review the document statuses before saving.')
      setOpenSaveConfirm(false)
      return
    }

    setSaving(true)

    try {
      const changed = await syncDocuments(id)
      await reloadDocuments(id)
      setSuccess(changed ? 'Documents saved.' : 'No document changes to save.')
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to save documents')
    } finally {
      setSaving(false)
      setOpenSaveConfirm(false)
    }
  }

  const deleteRecord = async () => {
    if (!isEdit || saving) return
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      await api.delete(`/users/${id}`)
      navigate('/users')
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to delete user')
    } finally {
      setSaving(false)
      setOpenDeleteConfirm(false)
    }
  }

  const askCancel = () => {
    if (!isDirty) {
      navigate('/users')
      return
    }
    setOpenCancelConfirm(true)
  }

  const handlePrimarySave = () => {
    if (currentStep === 'documents') {
      saveDocuments()
      return
    }
    saveProfile()
  }

  const renderProfileSectionStatus = (sectionId) => {
    const hasSectionError = (SECTION_FIELDS[sectionId] || []).some((fieldName) => Boolean(fieldErrors[fieldName]))
    if (hasSectionError) return <span className="user-accordion-pill is-warning">Needs review</span>
    return sectionCompletion[sectionId]
      ? <span className="user-accordion-pill is-complete">Complete</span>
      : <span className="user-accordion-pill is-pending">Incomplete</span>
  }

  const renderProfileSection = (sectionId) => {
    switch (sectionId) {
      case 'account':
        return (
          <div className="user-form-grid">
            <div className="user-form-field">
              <label className="user-form-label">Email *</label>
              <input className="user-form-control" type="email" name="email" value={formData.email} onChange={handleInputChange} />
              {fieldErrors.email && <small className="user-form-error">{fieldErrors.email}</small>}
            </div>
            <div className="user-form-field">
              <label className="user-form-label">Full Name *</label>
              <input className="user-form-control" type="text" name="full_name" value={formData.full_name} onChange={handleInputChange} />
              {fieldErrors.full_name && <small className="user-form-error">{fieldErrors.full_name}</small>}
            </div>
            <div className="user-form-field user-form-field-full">
              <label className="user-form-label">Roles *</label>
              <select
                className="user-form-control"
                name="roles"
                value={Array.isArray(formData.roles) && formData.roles[0] ? formData.roles[0] : ''}
                onChange={handleInputChange}
              >
                <option value="">Select role</option>
                {rolesOptions.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
              </select>
              {fieldErrors.roles && <small className="user-form-error">{fieldErrors.roles}</small>}
            </div>
            <div className="user-form-field">
              <label className="user-form-label">Account Status</label>
              <select className="user-form-control" name="is_active" value={formData.is_active === 1 ? '1' : '0'} onChange={handleInputChange}>
                <option value="1">Active</option>
                <option value="0">Inactive</option>
              </select>
            </div>
            <div className="user-form-field">
              <label className="user-form-label">Credentials</label>
              <div className="user-form-inline-note">Username will follow the email address. Password setup remains automatic.</div>
            </div>
          </div>
        )

      case 'employment':
        return (
          <div className="user-form-grid">
            <div className="user-form-field">
              <label className="user-form-label">Position Title *</label>
              <input className="user-form-control" type="text" name="position_title" value={formData.position_title} onChange={handleInputChange} />
              {fieldErrors.position_title && <small className="user-form-error">{fieldErrors.position_title}</small>}
            </div>
            <div className="user-form-field">
              <label className="user-form-label">Hire Date *</label>
              <input className="user-form-control" type="date" name="hire_date" value={formData.hire_date} onChange={handleInputChange} />
              {fieldErrors.hire_date && <small className="user-form-error">{fieldErrors.hire_date}</small>}
            </div>
            <div className="user-form-field">
              <label className="user-form-label">Employment Status *</label>
              <select className="user-form-control" name="employment_status" value={formData.employment_status} onChange={handleInputChange}>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="TERMINATED">Terminated</option>
              </select>
              {fieldErrors.employment_status && <small className="user-form-error">{fieldErrors.employment_status}</small>}
            </div>
            <div className="user-form-field">
              <label className="user-form-label">Employment Type</label>
              <select className="user-form-control" name="employment_type" value={formData.employment_type} onChange={handleInputChange}>
                <option value="">Select</option>
                <option value="REGULAR">Regular</option>
                <option value="PART_TIME">Part-time</option>
              </select>
            </div>
          </div>
        )

      case 'personal':
        return (
          <div className="user-form-grid">
            <div className="user-form-field">
              <label className="user-form-label">Birth Date</label>
              <input className="user-form-control" type="date" name="birth_date" value={formData.birth_date} onChange={handleInputChange} />
            </div>
            <div className="user-form-field">
              <label className="user-form-label">Sex</label>
              <select className="user-form-control" name="sex" value={formData.sex} onChange={handleInputChange}>
                <option value="">Select</option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
              </select>
            </div>
            <div className="user-form-field">
              <label className="user-form-label">Civil Status</label>
              <select className="user-form-control" name="civil_status" value={formData.civil_status} onChange={handleInputChange}>
                <option value="">Select</option>
                <option value="SINGLE">Single</option>
                <option value="MARRIED">Married</option>
                <option value="WIDOWED">Widowed</option>
                <option value="SEPARATED">Separated</option>
              </select>
            </div>
            <div className="user-form-field">
              <label className="user-form-label">Nationality</label>
              <input className="user-form-control" type="text" name="nationality" value={formData.nationality} onChange={handleInputChange} />
            </div>
            <div className="user-form-field">
              <label className="user-form-label">Mobile Number</label>
              <input className="user-form-control" type="tel" name="mobile_number" value={formData.mobile_number} onChange={handleInputChange} placeholder="09163550310 or +639163550310" />
              {fieldErrors.mobile_number && <small className="user-form-error">{fieldErrors.mobile_number}</small>}
            </div>
            <div className="user-form-field user-form-field-full">
              <label className="user-form-label">Present Address</label>
              <textarea className="user-form-control user-form-textarea" name="present_address" value={formData.present_address} onChange={handleInputChange} rows="3" />
            </div>
            <div className="user-form-field user-form-field-full">
              <label className="user-form-label">Permanent Address</label>
              <textarea className="user-form-control user-form-textarea" name="permanent_address" value={formData.permanent_address} onChange={handleInputChange} rows="3" />
            </div>
          </div>
        )

      case 'compensation':
        return (
          <div className="user-form-grid">
            <div className="user-form-field">
              <label className="user-form-label">Pay Basis</label>
              <select className="user-form-control" name="pay_basis" value={formData.pay_basis} onChange={handleInputChange}>
                <option value="">Select</option>
                <option value="DAILY">Daily</option>
                <option value="MONTHLY">Monthly</option>
              </select>
            </div>
            <div className="user-form-field">
              <label className="user-form-label">Pay Rate</label>
              <input className="user-form-control" type="number" name="pay_rate" value={formData.pay_rate} onChange={handleInputChange} step="0.01" />
              {fieldErrors.pay_rate && <small className="user-form-error">{fieldErrors.pay_rate}</small>}
            </div>
            <div className="user-form-field">
              <label className="user-form-label">Payroll Method</label>
              <select className="user-form-control" name="payroll_method" value={formData.payroll_method} onChange={handleInputChange}>
                <option value="CASH">Cash</option>
                <option value="BANK_TRANSFER">Bank transfer</option>
                <option value="E_WALLET">E-wallet</option>
              </select>
            </div>
            <div className="user-form-field">
              <label className="user-form-label">Current Pay Summary</label>
              <div className="user-form-inline-note">{formatCurrency(formData.pay_rate)}</div>
            </div>
            {(formData.payroll_method === 'BANK_TRANSFER' || formData.payroll_method === 'E_WALLET') && (
              <>
                <div className="user-form-field">
                  <label className="user-form-label">{formData.payroll_method === 'BANK_TRANSFER' ? 'Bank Name' : 'Wallet Provider'}</label>
                  <input className="user-form-control" type="text" name="provider_name" value={formData.bank_details.provider_name} onChange={handleBankDetailChange} />
                </div>
                <div className="user-form-field">
                  <label className="user-form-label">Account Name</label>
                  <input className="user-form-control" type="text" name="account_name" value={formData.bank_details.account_name} onChange={handleBankDetailChange} />
                </div>
                <div className="user-form-field">
                  <label className="user-form-label">Account Number</label>
                  <input className="user-form-control" type="text" name="account_number" value={formData.bank_details.account_number} onChange={handleBankDetailChange} />
                </div>
                <div className="user-form-field">
                  <label className="user-form-label">Account Type</label>
                  <input className="user-form-control" type="text" name="account_type" value={formData.bank_details.account_type} onChange={handleBankDetailChange} placeholder="Savings, Payroll, Verified wallet" />
                </div>
              </>
            )}
          </div>
        )

      case 'government':
        return (
          <div className="user-form-grid">
            <div className="user-form-field">
              <label className="user-form-label">TIN</label>
              <input className="user-form-control" type="text" name="tin" value={formData.tin} onChange={handleInputChange} />
              {fieldErrors.tin && <small className="user-form-error">{fieldErrors.tin}</small>}
            </div>
            <div className="user-form-field">
              <label className="user-form-label">SSS Number</label>
              <input className="user-form-control" type="text" name="sss_number" value={formData.sss_number} onChange={handleInputChange} />
              {fieldErrors.sss_number && <small className="user-form-error">{fieldErrors.sss_number}</small>}
            </div>
            <div className="user-form-field">
              <label className="user-form-label">PhilHealth PIN</label>
              <input className="user-form-control" type="text" name="philhealth_pin" value={formData.philhealth_pin} onChange={handleInputChange} />
              {fieldErrors.philhealth_pin && <small className="user-form-error">{fieldErrors.philhealth_pin}</small>}
            </div>
            <div className="user-form-field">
              <label className="user-form-label">Pag-IBIG MID</label>
              <input className="user-form-control" type="text" name="pagibig_mid" value={formData.pagibig_mid} onChange={handleInputChange} />
              {fieldErrors.pagibig_mid && <small className="user-form-error">{fieldErrors.pagibig_mid}</small>}
            </div>
          </div>
        )

      case 'emergency':
        return (
          <div className="user-form-grid">
            <div className="user-form-field">
              <label className="user-form-label">Contact Name</label>
              <input className="user-form-control" type="text" name="emergency_contact_name" value={formData.emergency_contact_name} onChange={handleInputChange} />
            </div>
            <div className="user-form-field">
              <label className="user-form-label">Relationship</label>
              <input className="user-form-control" type="text" name="emergency_contact_relationship" value={formData.emergency_contact_relationship} onChange={handleInputChange} />
            </div>
            <div className="user-form-field">
              <label className="user-form-label">Contact Number</label>
              <input className="user-form-control" type="text" name="emergency_contact_number" value={formData.emergency_contact_number} onChange={handleInputChange} />
            </div>
            <div className="user-form-field user-form-field-full">
              <label className="user-form-label">Address</label>
              <textarea className="user-form-control user-form-textarea" name="emergency_contact_address" value={formData.emergency_contact_address} onChange={handleInputChange} rows="3" />
            </div>
          </div>
        )

      default:
        return null
    }
  }

  const renderDocumentCard = (row) => {
    const isExpanded = expandedDocumentType === row.document_type
    const fileName = row.pending_file_name || row.original_name || 'No file uploaded'

    return (
      <div key={row.document_type} className={`user-document-item${row.marked_for_deletion ? ' is-muted' : ''}`}>
        <input
          ref={(element) => { fileInputRefs.current[row.document_type] = element }}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          style={{ display: 'none' }}
          onChange={(event) => {
            const file = event.target.files?.[0]
            handleDocumentFileChange(row.document_type, file)
            event.target.value = ''
          }}
        />

        <div className="user-document-summary">
          <button type="button" className="user-document-summary-main" onClick={() => setExpandedDocumentType(isExpanded ? null : row.document_type)}>
            <div className="user-document-title-row">
              <span className="user-document-title">{row.label}</span>
              <span className={`user-document-kind ${row.required ? 'is-required' : 'is-optional'}`}>
                {row.required ? 'Required' : 'Optional'}
              </span>
              <span className={getDocumentStatusClass(row.status)}>{getDocumentStatusLabel(row.status)}</span>
            </div>
            <div className="user-document-meta">
              <span>{fileName}</span>
              {row.size ? <span>{formatFileSize(row.size)}</span> : null}
              {row.issue_date ? <span>Issued {row.issue_date}</span> : null}
              {row.expiry_date ? <span>Expires {row.expiry_date}</span> : null}
            </div>
          </button>

          <div className="user-document-summary-actions">
            <button type="button" className="btn btn-secondary" onClick={() => fileInputRefs.current[row.document_type]?.click()}>
              {hasDocumentFile(row) ? 'Replace' : 'Upload'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setExpandedDocumentType(isExpanded ? null : row.document_type)}>
              {isExpanded ? 'Hide' : 'Details'}
            </button>
          </div>
        </div>

        {fieldErrors[`document:${row.document_type}`] && (
          <div className="user-document-inline-error">{fieldErrors[`document:${row.document_type}`]}</div>
        )}

        {isExpanded && (
          <div className="user-document-panel">
            <div className="user-form-grid">
              <div className="user-form-field">
                <label className="user-form-label">Document Number</label>
                <input className="user-form-control" type="text" value={row.document_number || ''} onChange={(event) => handleDocumentInputChange(row.document_type, 'document_number', event.target.value)} />
              </div>
              <div className="user-form-field">
                <label className="user-form-label">Issuing Agency</label>
                <input className="user-form-control" type="text" value={row.issuing_agency || ''} onChange={(event) => handleDocumentInputChange(row.document_type, 'issuing_agency', event.target.value)} />
              </div>
              <div className="user-form-field">
                <label className="user-form-label">Issue Date</label>
                <input className="user-form-control" type="date" value={row.issue_date || ''} onChange={(event) => handleDocumentInputChange(row.document_type, 'issue_date', event.target.value)} />
              </div>
              <div className="user-form-field">
                <label className="user-form-label">Expiry Date</label>
                <input className="user-form-control" type="date" value={row.expiry_date || ''} onChange={(event) => handleDocumentInputChange(row.document_type, 'expiry_date', event.target.value)} />
              </div>
              <div className="user-form-field">
                <label className="user-form-label">Status</label>
                <select className="user-form-control" value={row.status || 'NOT_SUBMITTED'} onChange={(event) => handleDocumentInputChange(row.document_type, 'status', event.target.value)}>
                  {DOCUMENT_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div className="user-form-field">
                <label className="user-form-label">Current File</label>
                <div className="user-form-inline-note">{fileName}</div>
              </div>
              <div className="user-form-field user-form-field-full">
                <label className="user-form-label">Remarks</label>
                <textarea className="user-form-control user-form-textarea" value={row.remarks || ''} onChange={(event) => handleDocumentInputChange(row.document_type, 'remarks', event.target.value)} rows="3" />
              </div>
            </div>

            <div className="user-document-panel-actions">
              <button type="button" className="btn btn-secondary" onClick={() => fileInputRefs.current[row.document_type]?.click()}>
                {hasDocumentFile(row) ? 'Replace File' : 'Upload File'}
              </button>
              <button type="button" className="btn btn-secondary" disabled={!row.download_url} onClick={() => handleDownloadDocument(row)}>
                Download
              </button>
              <button type="button" className="btn btn-danger" disabled={!row.id && !row.pending_file_name && !row.original_name} onClick={() => handleDocumentRemove(row.document_type)}>
                Remove
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  const saveButtonLabel = saving
    ? 'Saving...'
    : currentStep === 'documents'
      ? 'Save Documents'
      : isEdit
        ? 'Save Profile'
        : 'Create Profile'

  const saveConfirmTitle = currentStep === 'documents'
    ? 'Save Document Changes'
    : isEdit
      ? 'Save Profile Changes'
      : 'Create Employee Profile'

  const saveConfirmMessage = currentStep === 'documents'
    ? 'Save the current document register changes for this employee?'
    : isEdit
      ? 'Save the employee profile changes?'
      : 'Create this employee profile now? You can continue with documents on the next step.'

  return (
    <div className="page">
      <div className="page-header user-form-shell">
        <div>
          <h1 className="page-title">{isEdit ? 'Edit User & Employee' : 'Create User & Employee'}</h1>
          <p className="page-subtitle">
            {currentStep === 'documents'
              ? 'Manage statutory documents after the employee profile has been saved.'
              : 'Start with the core employee profile. Supporting documents can be completed on a separate step.'}
          </p>
        </div>
      </div>

      <div className="card user-form-card">
        {error && <div className="user-form-alert is-error">{error}</div>}
        {success && <div className="user-form-alert is-success">{success}</div>}

        {loading ? (
          <p>Loading...</p>
        ) : (
          <form onSubmit={(event) => { event.preventDefault(); setOpenSaveConfirm(true) }}>
            <div className="user-form-stepbar">
              <button type="button" className={`user-form-step${currentStep === 'profile' ? ' is-active' : ''}`} onClick={() => handleStepChange('profile')}>
                <span className="user-form-step-number">1</span>
                <span>
                  <strong>Profile</strong>
                  <small>Starter setup</small>
                </span>
              </button>
              <button type="button" className={`user-form-step${currentStep === 'documents' ? ' is-active' : ''}`} onClick={() => handleStepChange('documents')} disabled={!documentsEnabled}>
                <span className="user-form-step-number">2</span>
                <span>
                  <strong>Documents</strong>
                  <small>{documentsEnabled ? 'Government files' : 'Available after save'}</small>
                </span>
              </button>
            </div>

            {currentStep === 'profile' ? (
              <>
                <div className="user-form-intro">
                  <div>
                    <h2 className="user-form-intro-title">Starter Profile</h2>
                    <p className="user-form-intro-text">Save the login, role, and employee assignment first. The rest of the profile stays available section by section instead of all at once.</p>
                  </div>
                  <div className="user-form-intro-tags">
                    <span className={`user-form-intro-tag ${allProfileSectionsComplete ? 'is-complete' : starterSectionsComplete ? 'is-in-progress' : 'is-pending'}`}>
                      {allProfileSectionsComplete
                        ? 'Notification: Profile completed'
                        : starterSectionsComplete
                          ? 'Notification: Starter profile completed'
                          : 'Notification: Starter profile incomplete'}
                    </span>
                    <span className="user-form-intro-tag">Required now: Account &amp; Employment</span>
                    <span className="user-form-intro-tag">Complete later: Personal, Pay, IDs, Emergency</span>
                  </div>
                </div>

                <div className="user-form-body">
                  {PROFILE_SECTIONS.map((section) => (
                    <section key={section.id} className="user-form-section">
                      <button type="button" className={`user-accordion-trigger${openSection === section.id ? ' is-open' : ''}`} onClick={() => setOpenSection(section.id)}>
                        <div className="user-accordion-copy">
                          <span className="user-accordion-tone">{section.tone}</span>
                          <h2 className="user-accordion-title">{section.title}</h2>
                          <p className="user-accordion-note">{section.note}</p>
                        </div>
                        <div className="user-accordion-aside">
                          {renderProfileSectionStatus(section.id)}
                          <span className="user-accordion-toggle">{openSection === section.id ? 'Open' : 'View'}</span>
                        </div>
                      </button>
                      {openSection === section.id && (
                        <div className="user-form-section-content">
                          {renderProfileSection(section.id)}
                        </div>
                      )}
                    </section>
                  ))}
                </div>
              </>
            ) : (
              <div className="user-documents-shell">
                <div className="user-form-intro">
                  <div>
                    <h2 className="user-form-intro-title">Government Documents</h2>
                    <p className="user-form-intro-text">Keep files in a smaller register view. Open only one document at a time when you need to update metadata or upload a replacement file.</p>
                  </div>
                  <div className="user-form-intro-tags">
                    <span className="user-form-intro-tag">Required uploaded: {documentStats.requiredUploaded} / {documentStats.requiredTotal}</span>
                    <span className="user-form-intro-tag">Verified: {documentStats.verifiedCount}</span>
                  </div>
                </div>

                {!documentsEnabled ? (
                  <div className="user-document-empty">Save the employee profile first before managing government documents.</div>
                ) : (
                  <div className="user-document-groups">
                    <section className="user-document-group">
                      <div className="user-document-group-head">
                        <h3>Required Documents</h3>
                        <p>These are the primary statutory and onboarding files to monitor.</p>
                      </div>
                      {documentsByGroup.required.map(renderDocumentCard)}
                    </section>
                    <section className="user-document-group">
                      <div className="user-document-group-head">
                        <h3>Optional Documents</h3>
                        <p>Keep supporting files here only when they apply to this employee.</p>
                      </div>
                      {documentsByGroup.optional.map(renderDocumentCard)}
                    </section>
                  </div>
                )}
              </div>
            )}

            <div className="user-form-actions">
              {currentStep === 'documents' && documentsEnabled && (
                <button type="button" className="btn btn-secondary" onClick={() => handleStepChange('profile')} disabled={saving}>
                  Back to Profile
                </button>
              )}
              <button type="submit" className="btn btn-primary" disabled={saving}>{saveButtonLabel}</button>
              <button type="button" className="btn btn-secondary" onClick={askCancel} disabled={saving}>Cancel</button>
              {isEdit && (
                <button type="button" className="btn btn-danger" onClick={() => setOpenDeleteConfirm(true)} disabled={saving}>
                  Delete
                </button>
              )}
            </div>
          </form>
        )}
      </div>

      <ConfirmModal open={openSaveConfirm} onClose={() => setOpenSaveConfirm(false)} title={saveConfirmTitle} message={saveConfirmMessage} onConfirm={handlePrimarySave} loading={saving} />
      <ConfirmModal open={openCancelConfirm} onClose={() => setOpenCancelConfirm(false)} title="Discard Changes" message="You have unsaved changes. Leave this page and discard them?" onConfirm={() => navigate('/users')} />
      <ConfirmModal open={openDeleteConfirm} onClose={() => setOpenDeleteConfirm(false)} title="Delete User" message="Delete this user permanently? This action cannot be undone." onConfirm={deleteRecord} loading={saving} danger />
    </div>
  )
}
