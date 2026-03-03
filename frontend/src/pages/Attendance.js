import React from 'react'
import EntityPage from '../components/EntityPage.js'

const schema = [
  { name: 'id', label: 'ID', hidden: true },
  { name: 'employee_id', label: 'Employee ID', type: 'number' },
  { name: 'employee_name', label: 'Employee', hideInForm: true },
  { name: 'date', label: 'Date' },
  { name: 'clock_in', label: 'Clock In' },
  { name: 'clock_out', label: 'Clock Out' },
  { name: 'hours_worked', label: 'Hours', type: 'number' },
  { name: 'notes', label: 'Notes', type: 'textarea' }
]

export default function Attendance(){
  return React.createElement(EntityPage, { title: 'Attendance / Timesheets', apiPath: '/attendance', schema })
}
