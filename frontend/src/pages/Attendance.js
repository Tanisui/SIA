import React from 'react'
import EntityPage from '../components/EntityPage.js'

const schema = [
  { name: 'id', label: 'ID' },
  { name: 'employee_id', label: 'Employee' },
  { name: 'date', label: 'Date' },
  { name: 'clock_in', label: 'Clock in' },
  { name: 'clock_out', label: 'Clock out' },
  { name: 'hours_worked', label: 'Hours' },
  { name: 'notes', label: 'Notes' }
]

export default function Attendance(){
  return React.createElement(EntityPage, { title: 'Attendance / Timesheets', apiPath: '/attendance', schema })
}
