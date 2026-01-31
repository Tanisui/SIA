import React from 'react'
import EntityPage from '../components/EntityPage.js'

const schema = [
  { name: 'id', label: 'ID', hidden: true },
  { name: 'account_code', label: 'Account' },
  { name: 'entry_date', label: 'Date' },
  { name: 'description', label: 'Description' },
  { name: 'debit', label: 'Debit', type: 'number' },
  { name: 'credit', label: 'Credit', type: 'number' }
]

export default function Accounting(){
  return React.createElement(EntityPage, { title: 'Accounting / Ledger', apiPath: '/ledger', schema })
}
