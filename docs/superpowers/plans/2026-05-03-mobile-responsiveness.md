# Mobile Responsiveness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all 28+ pages of Cecille's N'Style POS fully responsive on Android and iOS phones/tablets via CSS-only additions to `index.css`.

**Architecture:** All changes are appended as a single organized block at the end of `frontend/src/index.css`. No React component files are modified. Breakpoints: ≤991.98px (tablet/sidebar-hidden), ≤768px (phone landscape), ≤480px (phone portrait).

**Tech Stack:** Custom CSS (no framework), React, Vite. The sidebar already slides off-canvas at ≤991.98px via existing CSS. We extend coverage for page content, cards, modals, forms, charts, toolbars.

---

## File Map

| File | Change |
|---|---|
| `frontend/src/index.css` | Append ~300 lines of mobile media query overrides (Tasks 1–7) |

---

## Known State (read before coding)

- `main-content` margin-left removed at both `≤768px` AND `≤991.98px` — both rules exist ✓
- `sidebar` slides off-canvas at `≤991.98px` ✓
- `topbar-toggle` (hamburger) shows at `≤991.98px` ✓
- `dashboard-grid` goes 2-col at `≤900px`, 1-col at `≤400px` ✓
- `table-wrap` gets `overflow-x: auto` at `≤900px`, `min-width: 480px` ✓
- `toolbar` stacks at `≤768px` ✓
- `modal` is already `width: 90%`, `max-height: 90vh` ✓
- `modal-footer` buttons do NOT stack on mobile ✗ → fix in Task 4
- `card-value` is `34px` — too large on 430px phones ✗ → fix in Task 2
- `notif-popover` is fixed `340px` wide — overflows on <375px phones ✗ → fix in Task 5
- `payroll-slip-header` uses flex row — breaks narrow screens ✗ → fix in Task 6
- Chart `<canvas>` elements have no mobile max-width constraint ✗ → fix in Task 3
- `user-form-step` has `min-width: 210px` — overflows on phone ✗ → fix in Task 6
- `page-header` actions don't stack at very small widths ✗ → fix in Task 5

---

## Task 1: Layout Shell — Fix Collapsed Sidebar + Smooth Transition

**Files:**
- Modify: `frontend/src/index.css` (append at end)

- [ ] **Step 1: Append layout shell fixes**

Open `frontend/src/index.css`, scroll to the very end (after line 9707), and append:

```css
/* ================================================================
   MOBILE RESPONSIVENESS — ALL PAGES
   Added: 2026-05-03
   Breakpoints: ≤991.98px tablet | ≤768px phone | ≤480px small phone
   ================================================================ */

/* ── 1. Layout Shell ─────────────────────────────────────────────── */

/* When sidebar-is-collapsed class is active on mobile, keep margin at 0 */
@media (max-width: 991.98px) {
  .layout.sidebar-is-collapsed .main-content {
    margin-left: 0 !important;
  }
}

/* Prevent horizontal overflow on body at all times */
html, body {
  overflow-x: hidden;
}

/* Smooth transition only on desktop (where sidebar margin changes) */
@media (min-width: 992px) {
  .main-content {
    transition: margin-left 0.2s ease;
  }
}
@media (max-width: 991.98px) {
  .main-content {
    transition: none;
  }
}
```

- [ ] **Step 2: Verify in browser**

Open the app in Chrome DevTools → Toggle to iPhone 14 Pro Max (430×932). Open sidebar via hamburger → close it. Confirm no horizontal scroll bar appears on any page. Confirm main content fills full width.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/index.css
git commit -m "style: fix layout shell for mobile — sidebar-collapsed margin + overflow"
```

---

## Task 2: Dashboard Cards & Chart Containers

**Files:**
- Modify: `frontend/src/index.css` (append after Task 1 block)

- [ ] **Step 1: Append card + chart fixes**

Append immediately after the Task 1 block:

```css
/* ── 2. Cards & Dashboard ────────────────────────────────────────── */

/* Reduce oversized card-value font on phones */
@media (max-width: 640px) {
  .card-value {
    font-size: 26px;
  }
  .card {
    padding: 14px 16px;
  }
  .card-header {
    padding-bottom: 10px;
    margin-bottom: 12px;
  }
}

@media (max-width: 480px) {
  .card-value {
    font-size: 22px;
  }
  .card {
    padding: 12px 14px;
  }
  .card-value-sm {
    font-size: 18px;
  }
}

/* Dashboard stat grid: single column on smallest phones */
@media (max-width: 430px) {
  .dashboard-grid {
    grid-template-columns: 1fr;
    gap: 10px;
  }
}

/* Dashboard lower section (charts): stack vertically on phones */
@media (max-width: 768px) {
  .dashboard-lower,
  .dashboard-charts,
  .dashboard-bottom-row {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
}

/* Chart canvas: never exceed container width */
canvas {
  max-width: 100% !important;
}

@media (max-width: 768px) {
  canvas {
    height: auto !important;
    max-height: 300px !important;
  }
}
```

- [ ] **Step 2: Verify in browser**

On iPhone 14 Pro Max view, open Dashboard. Confirm:
- Stat cards are readable (not clipped)
- Sales Trend chart fits within screen width
- Payment Mix donut fits within screen width
- Bestseller Performance bars fit within screen width
- No horizontal scroll on Dashboard page

- [ ] **Step 3: Commit**

```bash
git add frontend/src/index.css
git commit -m "style: reduce card values and constrain chart canvas on mobile"
```

---

## Task 3: Tables — Horizontal Scroll & Touch

**Files:**
- Modify: `frontend/src/index.css` (append after Task 2 block)

- [ ] **Step 1: Append table mobile fixes**

```css
/* ── 3. Tables ───────────────────────────────────────────────────── */

/* All table-wraps: horizontal scroll on tablet and phone */
@media (max-width: 991.98px) {
  .table-wrap {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  /* Wider min-width so columns stay readable while scrolling */
  .table-wrap table {
    min-width: 600px;
  }
  /* Smaller cell padding to save horizontal space */
  thead th,
  tbody td,
  tfoot td {
    padding: 9px 10px;
    font-size: 12.5px;
  }
}

/* Action button columns: always wrap, never clip */
@media (max-width: 768px) {
  .table-actions {
    flex-wrap: wrap;
    gap: 4px;
    justify-content: flex-end;
  }
  .table-actions .btn-sm {
    padding: 4px 8px;
    font-size: 11px;
  }
}

/* Reports table wrapper */
@media (max-width: 768px) {
  .reports-table-wrap {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  .reports-table-wrap table {
    min-width: 600px;
  }
}
```

- [ ] **Step 2: Verify in browser**

Switch to iPhone 14 Pro Max, open Inventory → Products tab. Confirm:
- Table scrolls horizontally with a finger swipe (or mouse drag)
- Columns are visible (not clipped)
- Action buttons (Edit, Delete) are tappable

Open Sales page → confirm same behavior.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/index.css
git commit -m "style: ensure all tables scroll horizontally on mobile with touch support"
```

---

## Task 4: Modals & Forms

**Files:**
- Modify: `frontend/src/index.css` (append after Task 3 block)

- [ ] **Step 1: Append modal mobile fixes**

```css
/* ── 4a. Modals ──────────────────────────────────────────────────── */

@media (max-width: 768px) {
  .modal-backdrop {
    align-items: flex-end;
    padding: 0;
  }
  .modal {
    width: 100%;
    max-width: 100%;
    border-radius: 16px 16px 0 0;
    max-height: 92vh;
    margin: 0;
  }
  .modal-header {
    padding: 16px 20px;
  }
  .modal-header h2 {
    font-size: 18px;
  }
  .modal-body {
    padding: 16px 20px;
  }
  .modal-footer {
    padding: 12px 20px;
    flex-direction: column-reverse;
    gap: 8px;
  }
  .modal-footer .btn {
    width: 100%;
    justify-content: center;
  }
}

/* On very small phones, keep modal from overflowing */
@media (max-width: 480px) {
  .modal {
    max-height: 88vh;
  }
  .modal-header h2 {
    font-size: 16px;
  }
}
```

- [ ] **Step 2: Append form mobile fixes**

```css
/* ── 4b. Forms ───────────────────────────────────────────────────── */

/* Multi-column form grids collapse to single column on phone */
@media (max-width: 768px) {
  .user-form-grid {
    grid-template-columns: 1fr !important;
  }
  .user-form-stepbar {
    flex-direction: column;
  }
  .user-form-step {
    min-width: 0;
    width: 100%;
  }
  .user-form-intro {
    flex-direction: column;
    gap: 12px;
  }
  .user-form-intro-tags {
    justify-content: flex-start;
  }
  .user-form-card {
    padding: 16px;
  }
  /* Customer form and other generic form grids */
  .form-grid,
  .form-row-2col {
    grid-template-columns: 1fr !important;
    gap: 12px;
  }
  /* Form inputs: min touch target */
  .form-input,
  .form-select,
  .user-form-control {
    min-height: 44px;
    font-size: 16px; /* prevents iOS auto-zoom on focus */
  }
}

@media (max-width: 480px) {
  .user-form-section-content {
    padding: 12px;
  }
  .user-accordion-trigger {
    padding: 12px 14px;
  }
}
```

- [ ] **Step 3: Verify in browser**

On iPhone 14 Pro Max:
1. Open Inventory → click Add Product → confirm modal slides up from bottom, fills screen, footer buttons are full-width and stacked
2. Open Users → Add User → confirm form fields are single-column, inputs are large enough to tap
3. Confirm no iOS auto-zoom on input focus (font-size 16px fix)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/index.css
git commit -m "style: mobile modal slide-up sheet + single-column forms on phone"
```

---

## Task 5: Page Headers, Toolbars & Filter Bars

**Files:**
- Modify: `frontend/src/index.css` (append after Task 4 block)

- [ ] **Step 1: Append page header and toolbar fixes**

```css
/* ── 5. Page Headers, Toolbars & Filter Bars ─────────────────────── */

/* Page title reduces further on small phones */
@media (max-width: 480px) {
  .page-title {
    font-size: 18px;
  }
  .page-subtitle {
    font-size: 12px;
  }
  .page-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    padding-bottom: 14px;
    margin-bottom: 16px;
  }
  /* Action buttons in page header go full-width on smallest phones */
  .page-header > .btn,
  .page-header > div > .btn {
    width: 100%;
    justify-content: center;
  }
}

/* Toolbar: all selects and search inputs full-width on phone */
@media (max-width: 768px) {
  .toolbar-left .form-select,
  .toolbar-right .form-select,
  .toolbar-left .form-input,
  .toolbar-right .form-input {
    width: 100%;
    min-width: 0;
  }
  /* Select dropdowns in toolbars: full width */
  .toolbar select {
    width: 100%;
  }
}

/* Breadcrumb: wrap tightly on phone */
@media (max-width: 480px) {
  .breadcrumb {
    font-size: 12px;
    gap: 4px;
    margin-bottom: 16px;
  }
}

/* Tab bars: scroll horizontally when tabs don't fit */
@media (max-width: 768px) {
  .tab-bar,
  .tabs,
  [class*="-tabs"],
  [class*="tab-list"] {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    flex-wrap: nowrap;
    scrollbar-width: none;
  }
  .tab-bar::-webkit-scrollbar,
  .tabs::-webkit-scrollbar {
    display: none;
  }
}
```

- [ ] **Step 2: Verify in browser**

On iPhone 14 Pro Max:
1. Open Inventory page → check tabs (Products, Stock-out, Damaged, etc.) scroll horizontally
2. Open Reports → filter toolbar stacks neatly
3. Open any page with a page title → confirm title and buttons don't overlap

- [ ] **Step 3: Commit**

```bash
git add frontend/src/index.css
git commit -m "style: page headers stack, toolbars full-width, tab bars scroll on mobile"
```

---

## Task 6: Page-Specific Fixes (Payroll, Sales Return, User Form)

**Files:**
- Modify: `frontend/src/index.css` (append after Task 5 block)

- [ ] **Step 1: Append payroll mobile fixes**

```css
/* ── 6a. Payroll Pages ───────────────────────────────────────────── */

@media (max-width: 768px) {
  /* Payslip header: stack company info and period info */
  .payroll-slip-header {
    flex-direction: column;
    gap: 12px;
  }
  .payroll-slip-period-block {
    text-align: left;
    justify-items: start;
  }
  /* Payslip paper: tighter padding on phone */
  .payroll-slip-paper {
    padding: 1rem;
  }
  /* Payroll summary grids: single column */
  .payroll-summary-grid,
  .payroll-grid-2col,
  [class*="payroll-grid"] {
    grid-template-columns: 1fr !important;
  }
}

@media (max-width: 480px) {
  .payroll-slip-paper {
    padding: 0.75rem;
  }
}
```

- [ ] **Step 2: Append sales return mobile fixes**

```css
/* ── 6b. Sales Return ────────────────────────────────────────────── */

@media (max-width: 768px) {
  .sales-return-lookup-grid {
    grid-template-columns: 1fr;
  }
  .sales-return-process-grid {
    grid-template-columns: 1fr;
  }
  .sales-return-paper-topbar {
    flex-direction: column;
    gap: 12px;
  }
  /* Items grid: scrollable instead of reflowing */
  .sales-return-paper-items {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  .sales-return-paper-items-header,
  .sales-return-paper-item {
    min-width: 560px;
  }
  .sales-return-process-footer {
    flex-direction: column;
    align-items: stretch;
  }
  .sales-return-process-summary {
    min-width: 0;
    width: 100%;
  }
}
```

- [ ] **Step 3: Append purchase order and supplier fixes**

```css
/* ── 6c. Purchase Order & Bale PO ───────────────────────────────── */

@media (max-width: 768px) {
  .po-table-wrap {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  .po-table-wrap table {
    min-width: 600px;
  }
}

/* ── 6d. Reports Summary Grid ───────────────────────────────────── */

@media (max-width: 480px) {
  .reports-summary-grid {
    grid-template-columns: 1fr !important;
    gap: 10px;
  }
}
```

- [ ] **Step 4: Verify in browser**

On iPhone 14 Pro Max:
1. Open Payroll → Payslips → confirm payslip header stacks (company left, period below)
2. Open Sales → Returns tab → confirm lookup grid is single-column, items scroll horizontally
3. Open Reports → confirm summary cards stack to 1 column on ≤480px

- [ ] **Step 5: Commit**

```bash
git add frontend/src/index.css
git commit -m "style: payroll, sales-return, and reports mobile layout fixes"
```

---

## Task 7: Header Notification Popover & Final Polish

**Files:**
- Modify: `frontend/src/index.css` (append after Task 6 block)

- [ ] **Step 1: Append notification popover and header polish**

```css
/* ── 7. Header & Notification Popover ───────────────────────────── */

/* Notification popover: clamp width so it doesn't overflow on narrow phones */
@media (max-width: 480px) {
  .notif-popover {
    width: calc(100vw - 32px);
    right: -48px;
    max-height: 70vh;
    overflow-y: auto;
  }
}

/* Header: tighten gap between action items on phone */
@media (max-width: 480px) {
  .header-right,
  .topbar-right {
    gap: 8px;
  }
  .btn-signout {
    padding: 0 0.6rem;
    font-size: 0.8rem;
  }
}
```

- [ ] **Step 2: Append general utility polish**

```css
/* ── 8. General Mobile Polish ───────────────────────────────────── */

/* Ensure all inline-flex rows wrap on phone */
@media (max-width: 480px) {
  .flex-row,
  .row,
  [class*="-row"]:not(tbody tr):not(thead tr) {
    flex-wrap: wrap;
  }
}

/* Input font-size 16px everywhere on mobile — prevents iOS auto-zoom */
@media (max-width: 768px) {
  input[type="text"],
  input[type="email"],
  input[type="password"],
  input[type="number"],
  input[type="search"],
  input[type="tel"],
  input[type="date"],
  select,
  textarea {
    font-size: 16px !important;
  }
}

/* Minimum touch targets for all interactive elements */
@media (max-width: 768px) {
  button,
  .btn,
  a.btn,
  [role="button"] {
    min-height: 40px;
  }
  .btn-sm {
    min-height: 32px;
  }
}

/* Login page: tighter on phone */
@media (max-width: 480px) {
  .login-card,
  .auth-card,
  [class*="login-"] {
    padding: 24px 20px;
    margin: 16px;
    width: calc(100% - 32px);
  }
}
```

- [ ] **Step 3: Final browser verification — all pages**

Open DevTools → iPhone 14 Pro Max (430×932). Check each major section:

| Page | Check |
|---|---|
| Dashboard | Cards readable, charts fit, no horizontal scroll |
| Inventory | Tabs scroll, table scrolls horizontally, modals slide up |
| Sales | Table scrolls, filter stacks, returns layout correct |
| Customers | Table scrolls, add/edit modal full-width |
| Users | Form single-column, step bar stacks |
| Reports | Summary cards stack, table scrolls |
| Payroll | Payslip header stacks, tables scroll |
| Attendance | Table scrolls |
| Settings | Form inputs full-width |
| Login | Card fits screen |

Also test at Samsung Galaxy S21 (360px) in DevTools.

- [ ] **Step 4: Final commit**

```bash
git add frontend/src/index.css
git commit -m "style: header notif popover, touch targets, iOS zoom fix, final mobile polish"
```

---

## Spec Coverage Check

| Spec Section | Task |
|---|---|
| Layout shell — margin-left, overflow | Task 1 |
| Cards 2-col tablet, 1-col phone | Task 2 (dashboard-grid already handles this, extended at 430px) |
| Charts max-width | Task 2 |
| Tables horizontal scroll | Task 3 |
| Modals full-width | Task 4 |
| Forms single-column | Task 4 |
| Page headers font + wrap | Task 5 |
| Filter/search bars | Task 5 |
| Pagination (already wraps inline) | N/A — flexWrap already set in component |
| Payroll pages | Task 6 |
| Sales return | Task 6 |
| Reports | Task 6 |
| Notification popover | Task 7 |
| Touch targets | Task 7 |
| iOS auto-zoom | Task 7 |
