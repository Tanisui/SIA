import React from 'react'
import {
  Document, Page, View, Text, StyleSheet, Font, Image
} from '@react-pdf/renderer'

Font.register({
  family: 'NotoSans',
  fonts: [
    { src: '/fonts/NotoSans-Regular.ttf', fontWeight: 400 },
    { src: '/fonts/NotoSans-Bold.ttf',    fontWeight: 700 },
  ],
})
Font.registerHyphenationCallback(word => [word])

// ── Color palette matching the gold/cream UI theme ──────────────────────
const C = {
  gold:       '#B8892A',
  goldLight:  '#E8D9C3',
  goldDark:   '#8B6914',
  cream:      '#FDF8F2',
  darkBrown:  '#1C1610',
  midBrown:   '#5C4A2A',
  lightText:  '#7C6A4A',
  white:      '#FFFFFF',
  border:     '#D4C4A0',
  rowAlt:     '#F9F4ED',
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: C.cream,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: C.darkBrown,
    paddingBottom: 40,
  },
  // ── Header bar ───────────────────────────────────────────────────────
  headerBar: {
    backgroundColor: C.gold,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  companyNameHeader: {
    color: C.white,
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
  },
  companySubHeader: {
    color: C.goldLight,
    fontSize: 8,
    marginTop: 2,
  },
  poTitleBlock: {
    alignItems: 'flex-end',
  },
  poTitle: {
    color: C.white,
    fontSize: 22,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 1,
  },
  poMetaText: {
    color: C.goldLight,
    fontSize: 8,
    marginTop: 2,
    textAlign: 'right',
  },
  // ── Body padding ────────────────────────────────────────────────────
  body: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  // ── Two-column address section ───────────────────────────────────────
  addrRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  addrCol: {
    flex: 1,
  },
  addrLabel: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: C.gold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: C.goldLight,
    paddingBottom: 2,
  },
  addrName: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: C.darkBrown,
    marginBottom: 2,
  },
  addrText: {
    fontSize: 8,
    color: C.midBrown,
    lineHeight: 1.5,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: C.goldLight,
    marginVertical: 8,
  },
  // ── Shipping info row ─────────────────────────────────────────────
  shipRow: {
    flexDirection: 'row',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  shipHeaderCell: {
    flex: 1,
    backgroundColor: C.gold,
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderRightWidth: 1,
    borderRightColor: C.goldDark,
  },
  shipHeaderLast: {
    borderRightWidth: 0,
  },
  shipHeaderText: {
    color: C.white,
    fontFamily: 'Helvetica-Bold',
    fontSize: 7,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  shipValueRow: {
    flexDirection: 'row',
  },
  shipValueCell: {
    flex: 1,
    backgroundColor: C.white,
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderRightWidth: 1,
    borderRightColor: C.border,
  },
  shipValueLast: {
    borderRightWidth: 0,
  },
  shipValueText: {
    color: C.midBrown,
    fontSize: 8,
  },
  // ── Items table ───────────────────────────────────────────────────
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: C.gold,
    borderRadius: 2,
    marginBottom: 0,
  },
  thCell: {
    paddingVertical: 6,
    paddingHorizontal: 5,
  },
  thText: {
    color: C.white,
    fontFamily: 'Helvetica-Bold',
    fontSize: 7.5,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: C.goldLight,
    minHeight: 20,
  },
  tableRowAlt: {
    backgroundColor: C.rowAlt,
  },
  tableRowEmpty: {
    minHeight: 20,
  },
  tdCell: {
    paddingVertical: 5,
    paddingHorizontal: 5,
    justifyContent: 'center',
  },
  tdText: {
    color: C.midBrown,
    fontSize: 8,
  },
  tdBold: {
    color: C.darkBrown,
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
  },
  tdRight: {
    textAlign: 'right',
  },
  // ── Totals ────────────────────────────────────────────────────────
  totalsSection: {
    flexDirection: 'row',
    marginTop: 6,
  },
  specialInstructions: {
    flex: 1,
    marginRight: 10,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 3,
    padding: 8,
    backgroundColor: C.white,
  },
  siLabel: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 7,
    color: C.gold,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  siText: {
    fontSize: 8,
    color: C.midBrown,
    lineHeight: 1.5,
  },
  totalsBlock: {
    width: 180,
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: C.border,
  },
  totalsLabel: {
    fontSize: 8,
    color: C.midBrown,
  },
  totalsValue: {
    fontSize: 8,
    color: C.darkBrown,
    fontFamily: 'Helvetica-Bold',
  },
  totalDueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: C.gold,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 3,
    marginTop: 4,
  },
  totalDueLabel: {
    color: C.white,
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
  },
  totalDueValue: {
    color: C.white,
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
  },
  // ── Payment terms ─────────────────────────────────────────────────
  termsBox: {
    marginTop: 10,
    backgroundColor: C.goldLight,
    borderRadius: 3,
    padding: 8,
    borderLeftWidth: 3,
    borderLeftColor: C.gold,
  },
  termsLabel: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    color: C.goldDark,
    marginBottom: 2,
  },
  termsText: {
    fontSize: 8,
    color: C.midBrown,
  },
  // ── Signature ─────────────────────────────────────────────────────
  signatureRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
    paddingHorizontal: 20,
  },
  sigBlock: {
    width: '35%',
    alignItems: 'center',
  },
  sigLine: {
    borderBottomWidth: 1,
    borderBottomColor: C.midBrown,
    width: '100%',
    marginBottom: 4,
  },
  sigLabel: {
    fontSize: 8,
    color: C.midBrown,
    textAlign: 'center',
  },
  // ── Footer ────────────────────────────────────────────────────────
  footer: {
    position: 'absolute',
    bottom: 16,
    left: 20,
    right: 20,
    textAlign: 'center',
    fontSize: 7.5,
    color: C.lightText,
    borderTopWidth: 0.5,
    borderTopColor: C.goldLight,
    paddingTop: 6,
  },
})

function fmt(v) {
  return '₱' + Number(v || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDate(v) {
  if (!v) return '-'
  const d = new Date(String(v).trim() + 'T00:00:00')
  return isNaN(d) ? String(v) : d.toLocaleDateString('en-PH', { month: 'short', day: '2-digit', year: 'numeric' })
}

// Column widths (must sum to 555 pt usable width on A4 at 72dpi ≈ paper-space)
const COL = {
  item:  { w: '12%' },
  desc:  { w: '38%' },
  qty:   { w: '12%' },
  unit:  { w: '13%' },
  price: { w: '12%' },
  total: { w: '13%' },
}

export function PODocument({ bale = {}, supplier = null, items = [], company = {} }) {
  const companyName    = company.name    || "Cecille's N'Style"
  const companyAddress = company.address || ''
  const companyPhone   = company.phone   || ''

  const displayItems = items.length > 0 ? items : [
    {
      item_code: '-',
      description: bale.bale_category || 'Bale Purchase',
      quantity:    bale.quantity_ordered || 1,
      unit:        'BAL',
      unit_price:  bale.bale_cost || 0,
      line_total:  bale.total_purchase_cost || bale.bale_cost || 0,
    },
  ]

  const emptyRows = Math.max(0, 8 - displayItems.length)
  const subtotal  = displayItems.reduce((s, r) => s + Number(r.line_total || 0), 0)
  const tax       = Number(bale.tax_amount || 0)
  const sh        = Number(bale.shipping_handling || 0)
  const totalDue  = subtotal + tax + sh

  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* ── Header bar ────────────────────────────────────────────── */}
        <View style={styles.headerBar}>
          <View>
            <Text style={styles.companyNameHeader}>{companyName}</Text>
            {companyAddress ? <Text style={styles.companySubHeader}>{companyAddress}</Text> : null}
            {companyPhone   ? <Text style={styles.companySubHeader}>Tel: {companyPhone}</Text> : null}
          </View>
          <View style={styles.poTitleBlock}>
            <Text style={styles.poTitle}>PURCHASE ORDER</Text>
            <Text style={styles.poMetaText}>DATE: {fmtDate(bale.purchase_date)}</Text>
            <Text style={styles.poMetaText}>PO#: {bale.po_number || bale.bale_batch_no || '-'}</Text>
            {supplier?.name ? <Text style={styles.poMetaText}>VENDOR: {supplier.name}</Text> : null}
          </View>
        </View>

        <View style={styles.body}>

          {/* ── Vendor + Ship To ────────────────────────────────────── */}
          <View style={styles.addrRow}>
            <View style={[styles.addrCol, { paddingRight: 12 }]}>
              <Text style={styles.addrLabel}>Vendor</Text>
              <Text style={styles.addrName}>{supplier?.name || bale.supplier_name || '-'}</Text>
              {supplier?.address ? <Text style={styles.addrText}>{supplier.address}</Text> : null}
              {supplier?.phone   ? <Text style={styles.addrText}>Tel: {supplier.phone}</Text> : null}
              {supplier?.email   ? <Text style={styles.addrText}>{supplier.email}</Text>   : null}
            </View>
            <View style={styles.addrCol}>
              <Text style={styles.addrLabel}>Ship To</Text>
              <Text style={styles.addrName}>{bale.ship_to_name || companyName}</Text>
              {bale.ship_to_address
                ? <Text style={styles.addrText}>{bale.ship_to_address}</Text>
                : companyAddress ? <Text style={styles.addrText}>{companyAddress}</Text> : null}
              {companyPhone ? <Text style={styles.addrText}>Tel: {companyPhone}</Text> : null}
            </View>
          </View>

          {/* ── Shipping details row ─────────────────────────────────── */}
          <View style={styles.shipRow}>
            {[
              { label: 'REQUISITIONER', value: bale.authorized_by || '-' },
              { label: 'SHIP VIA',      value: bale.ship_via      || '-' },
              { label: 'F.O.B. POINT',  value: bale.fob_point     || '-' },
              { label: 'SHIPPING TERMS',value: bale.shipping_terms|| '-' },
            ].map((col, i, arr) => (
              <View key={col.label} style={{ flex: 1 }}>
                <View style={[styles.shipHeaderCell, i === arr.length - 1 && styles.shipHeaderLast]}>
                  <Text style={styles.shipHeaderText}>{col.label}</Text>
                </View>
                <View style={[styles.shipValueCell, i === arr.length - 1 && styles.shipValueLast]}>
                  <Text style={styles.shipValueText}>{col.value}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* ── Items table ─────────────────────────────────────────── */}
          {/* Header */}
          <View style={styles.tableHeader}>
            <View style={[styles.thCell, { width: COL.item.w }]}><Text style={styles.thText}>Item</Text></View>
            <View style={[styles.thCell, { width: COL.desc.w }]}><Text style={styles.thText}>Description</Text></View>
            <View style={[styles.thCell, { width: COL.qty.w }]}><Text style={[styles.thText, styles.tdRight]}>Qty</Text></View>
            <View style={[styles.thCell, { width: COL.unit.w }]}><Text style={styles.thText}>Unit</Text></View>
            <View style={[styles.thCell, { width: COL.price.w }]}><Text style={[styles.thText, styles.tdRight]}>Unit Price</Text></View>
            <View style={[styles.thCell, { width: COL.total.w }]}><Text style={[styles.thText, styles.tdRight]}>Total</Text></View>
          </View>

          {/* Rows */}
          {displayItems.map((row, i) => (
            <View key={i} style={[styles.tableRow, i % 2 !== 0 && styles.tableRowAlt]}>
              <View style={[styles.tdCell, { width: COL.item.w }]}>
                <Text style={styles.tdText}>{row.item_code || ''}</Text>
              </View>
              <View style={[styles.tdCell, { width: COL.desc.w }]}>
                <Text style={styles.tdBold}>{row.description || ''}</Text>
              </View>
              <View style={[styles.tdCell, { width: COL.qty.w }]}>
                <Text style={[styles.tdText, styles.tdRight]}>{row.quantity || ''} {row.unit || ''}</Text>
              </View>
              <View style={[styles.tdCell, { width: COL.unit.w }]}>
                <Text style={styles.tdText}>{row.unit || ''}</Text>
              </View>
              <View style={[styles.tdCell, { width: COL.price.w }]}>
                <Text style={[styles.tdText, styles.tdRight]}>
                  {row.unit_price != null ? fmt(row.unit_price) : ''}
                </Text>
              </View>
              <View style={[styles.tdCell, { width: COL.total.w }]}>
                <Text style={[styles.tdBold, styles.tdRight]}>
                  {row.line_total != null ? fmt(row.line_total) : ''}
                </Text>
              </View>
            </View>
          ))}

          {/* Empty rows to fill space */}
          {Array.from({ length: emptyRows }).map((_, i) => (
            <View key={`empty-${i}`} style={[styles.tableRow, (displayItems.length + i) % 2 !== 0 && styles.tableRowAlt]}>
              <View style={[styles.tdCell, { width: COL.item.w }]}><Text style={styles.tdText}> </Text></View>
              <View style={[styles.tdCell, { width: COL.desc.w }]}><Text style={styles.tdText}> </Text></View>
              <View style={[styles.tdCell, { width: COL.qty.w }]}><Text style={styles.tdText}> </Text></View>
              <View style={[styles.tdCell, { width: COL.unit.w }]}><Text style={styles.tdText}> </Text></View>
              <View style={[styles.tdCell, { width: COL.price.w }]}><Text style={styles.tdText}> </Text></View>
              <View style={[styles.tdCell, { width: COL.total.w }]}><Text style={styles.tdText}> </Text></View>
            </View>
          ))}

          {/* ── Totals + Special Instructions ─────────────────────── */}
          <View style={styles.totalsSection}>
            {/* Special instructions (left) */}
            <View style={styles.specialInstructions}>
              <Text style={styles.siLabel}>Special Instructions</Text>
              <Text style={styles.siText}>
                {bale.special_instructions || 'None'}
              </Text>
            </View>

            {/* Totals (right) */}
            <View style={styles.totalsBlock}>
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>Sub Total</Text>
                <Text style={styles.totalsValue}>{fmt(subtotal)}</Text>
              </View>
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>Sales Tax / VAT</Text>
                <Text style={styles.totalsValue}>{fmt(tax)}</Text>
              </View>
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>Shipping &amp; Handling</Text>
                <Text style={styles.totalsValue}>{fmt(sh)}</Text>
              </View>
              <View style={styles.totalDueRow}>
                <Text style={styles.totalDueLabel}>TOTAL DUE</Text>
                <Text style={styles.totalDueValue}>{fmt(totalDue)}</Text>
              </View>
            </View>
          </View>

          {/* ── Payment terms box (if credit PO) ─────────────────── */}
          {bale.payment_method === 'PURCHASE_ORDER' && bale.payment_terms_days ? (
            <View style={styles.termsBox}>
              <Text style={styles.termsLabel}>
                Payment Terms: Net {bale.payment_terms_days} Days
              </Text>
              <Text style={styles.termsText}>
                Due Date: {fmtDate(bale.po_due_date)}
              </Text>
            </View>
          ) : null}

          {/* ── Signature ─────────────────────────────────────────── */}
          <View style={styles.signatureRow}>
            <View style={styles.sigBlock}>
              <View style={styles.sigLine} />
              <Text style={styles.sigLabel}>Authorized by</Text>
            </View>
            <View style={styles.sigBlock}>
              <View style={styles.sigLine} />
              <Text style={styles.sigLabel}>Date</Text>
            </View>
          </View>

        </View>

        {/* ── Footer ──────────────────────────────────────────────── */}
        <Text style={styles.footer}>
          If you have any questions concerning this purchase, please contact {companyName}.
          {companyPhone ? `  Tel: ${companyPhone}` : ''}
        </Text>

      </Page>
    </Document>
  )
}
