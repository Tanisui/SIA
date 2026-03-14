# Component Usage Guide

## Complete Reference for New UI Components

This guide shows how to use all the new UI components created for the SIA POS system.

---

## 📦 **Core Components**

### 1. **Loading Component**
Display loading states throughout your application.

```javascript
import Loading, { LoadingPage, LoadingOverlay } from '../components/Loading.js'

// Basic loading spinner with text
<Loading size="md" text="Loading..." />

// Full page loading state
<LoadingPage />

// Overlay loading (for data processing)
<LoadingOverlay visible={loading} />

// Sizes: 'sm', 'md', 'lg'
<Loading size="lg" text="Processing..." />
```

---

### 2. **Modal Component**
Create modal dialogs for user interactions.

```javascript
import Modal, { ConfirmModal } from '../components/Modal.js'
import { useState } from 'react'

export function MyPage() {
  const [open, setOpen] = useState(false)
  
  return (
    <>
      <button onClick={() => setOpen(true)}>Open Modal</button>
      
      <Modal 
        open={open} 
        onClose={() => setOpen(false)}
        title="Edit User"
        size="md" // 'sm', 'md', 'lg'
        footer={
          <>
            <button className="btn btn-secondary">Cancel</button>
            <button className="btn btn-primary">Save</button>
          </>
        }
      >
        <p>Modal content goes here</p>
      </Modal>
    </>
  )
}

// Confirm Modal (with action)
<ConfirmModal 
  open={confirmOpen}
  onClose={() => setConfirmOpen(false)}
  title="Delete User?"
  message="This action cannot be undone."
  onConfirm={handleDelete}
  loading={deleting}
  danger={true}
/>
```

---

### 3. **Alert Component**
Show success/error/warning messages.

```javascript
import Alert, { AlertContainer } from '../components/Alert.js'
import { useState } from 'react'

// Single alert
<Alert 
  type="success" // 'success', 'error', 'warning', 'info'
  message="User created successfully!"
  autoClose={true}
  duration={5000}
  onClose={() => console.log('Closed')}
/>

// Alert container for multiple alerts
const [alerts, setAlerts] = useState([])

const addAlert = (type, message) => {
  setAlerts([...alerts, { type, message }])
}

<AlertContainer 
  alerts={alerts} 
  onRemove={(idx) => setAlerts(alerts.filter((_, i) => i !== idx))}
/>

// Usage
addAlert('success', 'Profile updated!')
addAlert('error', 'Failed to save changes')
```

---

### 4. **Empty State Component**
Display when there's no data.

```javascript
import EmptyState, { EmptySearchResults, EmptyTableState } from '../components/EmptyState.js'

// Generic empty state
<EmptyState 
  icon="📭"
  title="No Users Found"
  description="Start by creating your first user"
  action={handleCreateUser}
  actionLabel="Create User"
/>

// Search empty state
<EmptySearchResults />

// Table empty state
<EmptyTableState itemName="products" />
```

---

### 5. **Form Components**
Build consistent forms with validation.

```javascript
import { 
  FormInput, 
  FormSelect, 
  FormTextarea,
  FormRow,
  FormCol 
} from '../components/FormGroup.js'
import { useState } from 'react'

export function UserForm() {
  const [form, setForm] = useState({ name: '', email: '', role: '' })
  const [errors, setErrors] = useState({})

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <FormRow>
        <FormCol>
          <FormInput
            label="Full Name"
            name="name"
            required
            value={form.name}
            onChange={handleChange}
            error={errors.name}
            help="Enter your full name"
          />
        </FormCol>
        <FormCol>
          <FormInput
            label="Email"
            name="email"
            type="email"
            required
            value={form.email}
            onChange={handleChange}
            error={errors.email}
          />
        </FormCol>
      </FormRow>

      <FormSelect
        label="Role"
        name="role"
        value={form.role}
        onChange={handleChange}
        options={[
          { value: 'admin', label: 'Administrator' },
          { value: 'staff', label: 'Staff' },
          { value: 'viewer', label: 'Viewer' }
        ]}
      />

      <FormTextarea
        label="Notes"
        name="notes"
        placeholder="Add any additional notes..."
      />

      <button type="submit" className="btn btn-primary mt-4">Save</button>
    </form>
  )
}
```

---

### 6. **Table Component**
Display data in tables with actions.

```javascript
import { Table, TableActions } from '../components/Table.js'
import EmptyTableState from '../components/EmptyState.js'
import { useState } from 'react'

export function UsersPage() {
  const [users, setUsers] = useState([
    { id: 1, name: 'John Doe', email: 'john@example.com', role: 'Admin' },
    { id: 2, name: 'Jane Smith', email: 'jane@example.com', role: 'Staff' }
  ])
  const [loading, setLoading] = useState(false)

  return (
    <Table
      headers={[
        { key: 'name', label: 'Name' },
        { key: 'email', label: 'Email' },
        { key: 'role', label: 'Role' },
        { 
          key: 'actions', 
          label: 'Actions',
          render: (_, row) => (
            <TableActions
              onView={() => console.log('View', row)}
              onEdit={() => console.log('Edit', row)}
              onDelete={() => console.log('Delete', row)}
            />
          )
        }
      ]}
      rows={users}
      loading={loading}
      empty={<EmptyTableState itemName="users" />}
    />
  )
}
```

---

### 7. **Badge Component**
Display status and category badges.

```javascript
import Badge, { StatusBadge, PaymentBadge } from '../components/Badge.js'

// Generic badge
<Badge variant="success">Active</Badge>
<Badge variant="danger">Inactive</Badge>
<Badge variant="warning">Pending</Badge>
<Badge variant="info">Info</Badge>
<Badge variant="neutral">Draft</Badge>
<Badge variant="primary">Featured</Badge>

// Status badge (auto-formatted)
<StatusBadge status="active" />
<StatusBadge status="pending" />
<StatusBadge status="completed" />

// Payment badge
<PaymentBadge method="cash" />
<PaymentBadge method="card" />
<PaymentBadge method="transfer" />
```

---

### 8. **Breadcrumb Component**
Navigation breadcrumbs for better UX.

```javascript
import Breadcrumb, { SimpleBreadcrumb } from '../components/Breadcrumb.js'

// Full breadcrumb
<Breadcrumb 
  items={[
    { label: 'Dashboard', to: '/' },
    { label: 'Users', to: '/users' },
    { label: 'Edit User' }
  ]}
/>

// Simple breadcrumb
<SimpleBreadcrumb current="Edit User" />
```

---

### 9. **Pagination Component**
Paginate through large lists.

```javascript
import Pagination, { PaginationInfo } from '../components/Pagination.js'
import { useState } from 'react'

export function UsersList() {
  const [page, setPage] = useState(1)
  const itemsPerPage = 10
  const totalItems = 156

  return (
    <>
      {/* Your table or list here */}
      
      <PaginationInfo 
        current={page}
        pageSize={itemsPerPage}
        total={totalItems}
      />
      
      <Pagination
        current={page}
        total={Math.ceil(totalItems / itemsPerPage)}
        onPageChange={setPage}
        loading={false}
      />
    </>
  )
}
```

---

### 10. **Card Components**
Flexible card layouts.

```javascript
import { 
  Card, 
  CardHeader, 
  CardBody, 
  CardFooter,
  StatCard,
  InfoCard 
} from '../components/Card.js'

// Basic card
<Card>
  <CardHeader>
    <h3>Header</h3>
  </CardHeader>
  <CardBody>
    Content here
  </CardBody>
  <CardFooter>
    <button>Action</button>
  </CardFooter>
</Card>

// Stat card
<StatCard
  title="Total Sales"
  value="₱45,000"
  subtitle="Today's revenue"
  icon="📊"
  variant="success" // 'default', 'success', 'danger', 'warning', 'info'
/>

// Info card
<InfoCard
  title="System Maintenance"
  message="Scheduled for tonight at 2 AM"
  type="info" // 'info', 'success', 'warning', 'error'
/>
```

---

### 11. **Tooltip Component**
Add helpful hints to your interface.

```javascript
import Tooltip, { HelpIcon } from '../components/Tooltip.js'

// Inline tooltip
<Tooltip text="This is helpful information" position="top">
  <button>Hover me</button>
</Tooltip>

// Help icon with tooltip
<div>
  Minimum Stock Level
  <HelpIcon text="Alert when inventory falls below this number" />
</div>

// Positions: 'top', 'bottom', 'left', 'right'
```

---

## 🎨 **CSS Utility Classes**

### Spacing
```html
<!-- Margins -->
<div class="mt-1">Top margin 6px</div>
<div class="mb-4">Bottom margin 24px</div>
<div class="px-3">Horizontal padding 18px</div>
<div class="py-2">Vertical padding 12px</div>

<!-- Flexbox gap -->
<div class="flex gap-2">Item 1</div> <!-- 12px gap -->
```

### Layout
```html
<div class="flex">Flex row</div>
<div class="flex-col">Flex column</div>
<div class="flex-between">Space between</div>
<div class="flex-center">Center content</div>
```

### Sizing
```html
<div class="w-full">Full width</div>
<div class="h-full">Full height</div>
<div class="max-w-full">Max full width</div>
```

### Colors & Effects
```html
<span class="text-success">Success text</span>
<span class="text-error">Error text</span>
<span class="text-warning">Warning text</span>
<span class="text-muted">Muted text</span>

<div class="shadow-md">Medium shadow</div>
<div class="rounded-lg">Large border radius</div>
<div class="opacity-50">50% opacity</div>
```

---

## 🔧 **Button Variants**

```html
<!-- Primary button -->
<button class="btn btn-primary">Save</button>

<!-- Secondary button -->
<button class="btn btn-secondary">Cancel</button>

<!-- Outline button -->
<button class="btn btn-outline">Learn More</button>

<!-- Danger button -->
<button class="btn btn-danger">Delete</button>

<!-- Success button -->
<button class="btn btn-success">Confirm</button>

<!-- Sizes -->
<button class="btn btn-sm">Small</button>
<button class="btn">Medium (default)</button>
<button class="btn btn-lg">Large</button>

<!-- Icon button -->
<button class="btn btn-icon">🔍</button>

<!-- Disabled state -->
<button class="btn btn-primary" disabled>Disabled</button>

<!-- Loading state -->
<button class="btn btn-primary" disabled>⏳ Loading...</button>
```

---

## 📝 **Form Validation Example**

```javascript
export function ValidatedForm() {
  const [form, setForm] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState({})

  const validate = () => {
    const newErrors = {}
    if (!form.email) newErrors.email = 'Email is required'
    if (!form.email.includes('@')) newErrors.email = 'Invalid email'
    if (!form.password) newErrors.password = 'Password is required'
    if (form.password.length < 6) newErrors.password = 'Min 6 characters'
    return newErrors
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const newErrors = validate()
    
    if (Object.keys(newErrors).length === 0) {
      // Submit form
    } else {
      setErrors(newErrors)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <FormInput
        label="Email"
        type="email"
        required
        value={form.email}
        onChange={(e) => setForm({ ...form, email: e.target.value })}
        error={errors.email}
      />

      <FormInput
        label="Password"
        type="password"
        required
        value={form.password}
        onChange={(e) => setForm({ ...form, password: e.target.value })}
        error={errors.password}
      />

      <button type="submit" className="btn btn-primary w-full mt-4">
        Login
      </button>
    </form>
  )
}
```

---

## 🚀 **Best Practices**

1. **Always handle loading states** - Use `<Loading />` while fetching data
2. **Validate forms** - Show errors with `<FormInput error={...} />`
3. **Confirm destructive actions** - Use `<ConfirmModal />` for delete operations
4. **Show empty states** - Use `<EmptyState />` when no data is available
5. **Provide feedback** - Use `<Alert />` after user actions
6. **Add help text** - Use `<HelpIcon />` for complex fields
7. **Use badges** - Display status with `<StatusBadge />`
8. **Keep spacing consistent** - Use utility classes (`.mt-3`, `.px-2`, etc.)
9. **Test accessibility** - All components have focus states and keyboard support
10. **Use tooltips sparingly** - Only for non-obvious functionality

---

## 📱 **Responsive Behavior**

All components are mobile-responsive:
- Buttons have touch-friendly sizes (min 40px height)
- Forms stack on mobile
- Tables are responsive
- Modals adapt to screen size
- Navigation works on touch devices

---

## 🎯 **Common Patterns**

### Data Table with Search and Actions
```javascript
const [users, setUsers] = useState([])
const [search, setSearch] = useState('')
const [page, setPage] = useState(1)

const filtered = users.filter(u => 
  u.name.toLowerCase().includes(search.toLowerCase())
)

return (
  <>
    <div className="toolbar">
      <input 
        className="search-input" 
        placeholder="Search users..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <button className="btn btn-primary">+ Add User</button>
    </div>

    <Table headers={[...]} rows={filtered} />

    <Pagination 
      current={page}
      total={Math.ceil(filtered.length / 10)}
      onPageChange={setPage}
    />
  </>
)
```

---

**For more details, refer to individual component files in `src/components/`**
