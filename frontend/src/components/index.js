/**
 * Components Index - Import all UI components from here
 * 
 * Usage:
 * import { Modal, Alert, Table, FormInput } from '../components/index.js'
 */

// Core Components
export { default as Loading, LoadingPage, LoadingOverlay } from './Loading.js'
export { default as Modal, ConfirmModal } from './Modal.js'
export { default as Alert, AlertContainer } from './Alert.js'
export { default as EmptyState, EmptySearchResults, EmptyTableState } from './EmptyState.js'

// Form Components
export { 
  FormGroup, 
  FormInput, 
  FormSelect, 
  FormTextarea,
  FormRow,
  FormCol 
} from './FormGroup.js'

// Data Display
export { Table, TableActions } from './Table.js'
export { default as Badge, StatusBadge, PaymentBadge } from './Badge.js'
export { default as Pagination, PaginationInfo } from './Pagination.js'

// Card Components
export { 
  Card, 
  CardHeader, 
  CardBody, 
  CardFooter,
  StatCard,
  InfoCard 
} from './Card.js'

// Navigation
export { default as Breadcrumb, SimpleBreadcrumb } from './Breadcrumb.js'

// Utility
export { default as Tooltip, HelpIcon } from './Tooltip.js'

// Layouts
export { default as Header } from './Header.js'
export { default as Sidebar } from './Sidebar.js'
export { default as Layout } from './Layout.js'
