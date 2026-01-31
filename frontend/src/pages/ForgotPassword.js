import React, { useState } from 'react'
import api from '../api/api.js'

export default function ForgotPassword(){
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState(null)

  const submit = async (e) =>{
    e.preventDefault()
    try{
      const res = await api.post('/auth/forgot-password',{ email })
      setMsg(res.data.message || 'If the email exists, a reset link was sent')
    }catch(err){
      setMsg('Failed to submit')
    }
  }

  return (
    React.createElement('div',{ style:{ display:'flex', minHeight:'100vh', alignItems:'center', justifyContent:'center' } },
      React.createElement('form',{ onSubmit: submit, style:{ width:360, padding:24, border:'1px solid #eee', borderRadius:8 } },
        React.createElement('h2', null, 'Forgot password'),
        React.createElement('div', null,
          React.createElement('label', null, 'Email'),
          React.createElement('input',{ value: email, onChange: e => setEmail(e.target.value), required:true, style:{ width:'100%', padding:8, marginTop:4 } })
        ),
        msg && React.createElement('div',{ style:{ marginTop:8 } }, msg),
        React.createElement('button',{ type:'submit', style:{ marginTop:12, padding:'8px 12px' } }, 'Submit')
      )
    )
  )
}
