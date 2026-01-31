import React from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useState, useRef, useEffect } from 'react'
import { logout } from '../store/authSlice.js'

export default function Header() {
  const dispatch = useDispatch()
  const user = useSelector(s => s.auth.user)

  const [open, setOpen] = useState(false)
  const popRef = useRef()

  useEffect(()=>{
    function onDoc(e){
      if (!popRef.current) return
      if (!popRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('click', onDoc)
    return ()=> document.removeEventListener('click', onDoc)
  },[])

  return (
    React.createElement('header', { style: { padding: '12px 20px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
      React.createElement('div', null, React.createElement('strong', null, "Cecille's N'Style")),
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', position: 'relative' } },
        user && React.createElement('button', { onClick: ()=>setOpen(v=>!v), style: { marginRight: 12, background:'transparent', border:'none', cursor:'pointer', fontSize:20 } }, '🔔'),
        user && React.createElement('span', { style: { marginRight: 12 } }, `Hi, ${user.full_name || user.username}`),
        React.createElement('button', { onClick: () => dispatch(logout()), style: { padding: '6px 10px' } }, 'Sign out'),
        open && React.createElement('div', { ref: popRef, style: { position:'absolute', right:12, top:48, width:320, background:'#fff', border:'1px solid #ddd', boxShadow:'0 6px 18px rgba(0,0,0,0.08)', borderRadius:6, zIndex:40, padding:12 } },
          React.createElement('div', { style:{ fontWeight:600, marginBottom:8 } }, 'Notifications'),
          React.createElement('div', { style:{ maxHeight:240, overflow:'auto' } },
            React.createElement('div', { style:{ padding:8, borderBottom:'1px solid #f4f4f4' } }, 'No notifications'),
            React.createElement('div', { style:{ padding:8, borderBottom:'1px solid #f4f4f4' } }, 'System message examples')
          ),
          React.createElement('div', { style:{ textAlign:'right', marginTop:8 } }, React.createElement('button', { onClick: ()=>setOpen(false) }, 'Close'))
        )
      )
    )
  )
}
