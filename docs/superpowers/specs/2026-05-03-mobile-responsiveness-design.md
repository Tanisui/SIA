# Mobile Responsiveness Design — Cecille's N'Style POS

**Date:** 2026-05-03  
**Approach:** CSS-Only Enhancement (Approach A)  
**Scope:** All 28+ pages responsive for Android and iOS phones and tablets

---

## Background

The system is a fully custom React SPA with 9,700+ lines of CSS using CSS variables, Flexbox, and Grid. The sidebar already has an off-canvas slide-in on mobile (<992px). The problem is page content (cards, tables, forms, modals, charts) does not adapt to small screens — layouts overflow, cards stay in fixed rows, and text becomes unreadable.

No React component logic will change. All fixes are CSS-only additions to `frontend/src/index.css`.

---

## Breakpoints

| Breakpoint | Target |
|---|---|
| `≤991px` | Tablet — sidebar becomes overlay (already working), content adapts to full width |
| `≤768px` | Phone landscape / large Android/iOS phones |
| `≤480px` | Phone portrait — iPhone SE, standard Android |

---

## Section 1 — Layout Shell

- `main-content` on `≤991px`: `margin-left: 0`, `width: 100%`
- Page padding: `36px` → `20px` (≤991px) → `14px` (≤480px)
- Header: tighten horizontal padding, ensure hamburger toggle is tappable (min 44x44px)
- Sidebar overlay and slide-in already functional — verify and fix any edge cases

---

## Section 2 — Cards & Summary Grids

Applies to: Dashboard, Reports, Payroll, Attendance, Expenses summary sections.

- `≤991px`: stat card grids → `repeat(2, 1fr)` (2 columns)
- `≤480px`: stat card grids → `repeat(1, 1fr)` (1 column, full width)
- Card padding reduces: `24px` → `16px` → `12px`
- Card text (labels, amounts) scales down appropriately

---

## Section 3 — Tables

Applies to: Inventory, Sales, Customers, Suppliers, Purchasing, Roles, Users, Audit, Expenses, Payroll tables.

- At `≤768px`: table container gets `overflow-x: auto`, `-webkit-overflow-scrolling: touch`
- Table itself gets `min-width: 600px` to maintain column structure while scrolling
- Row font size: `13px` on mobile (down from `14px`)
- Action buttons in table rows: remain accessible, min touch target 44px

---

## Section 4 — Modals & Forms

**Modals** (all modals site-wide):
- `≤768px`: `width: 95vw`, `max-height: 90vh`, `overflow-y: auto`
- Centered with `margin: auto`, no fixed pixel widths

**Forms** (UserFormPage, CustomerFormPage, product/supplier/category forms):
- `≤768px`: multi-column grid collapses to single column
- Labels stack above inputs (`flex-direction: column`)
- Input fields: `width: 100%`
- Submit/Cancel buttons: `width: 100%`, stack vertically with gap

---

## Section 5 — Charts, Page Headers, Pagination, Action Bars

**Charts** (Dashboard Sales Trend, Payment Mix donut, Bestseller Performance):
- `max-width: 100%`, `height: auto`
- Chart containers: `min-height: 200px`, `max-height: 350px` on mobile

**Page headers** (title + action buttons row):
- `≤768px`: wrap to column, title above buttons
- Title font size: `26px` → `20px` → `18px`
- Action buttons (Add, Export, Filter): `width: 100%` on small screens OR wrap naturally

**Pagination**:
- `≤480px`: hide intermediate page number buttons, show prev/next + current page indicator only

**Filter/search bars**:
- `≤768px`: inputs and dropdowns stack vertically, full width

---

## Files Changed

| File | Change |
|---|---|
| `frontend/src/index.css` | Add mobile media query blocks (organized by section) at end of file |

No React component files changed.

---

## Success Criteria

- Dashboard renders cleanly on iPhone 14 Pro Max (430px) and Samsung Galaxy standard (412px)
- No horizontal scroll on any page except inside data tables (intentional)
- Sidebar opens/closes via hamburger on all phone sizes
- All forms usable with touch — inputs full width, buttons large enough
- Charts visible and readable on phone
- Modals fit within viewport on phone
