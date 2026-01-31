import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import api from '../api/api'

const initialState = {
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  token: localStorage.getItem('token') || null,
  permissions: JSON.parse(localStorage.getItem('permissions') || '[]'),
  status: 'idle',
  error: null
}

export const login = createAsyncThunk('auth/login', async ({ username, password }, thunkAPI) => {
  try {
    const res = await api.post('/auth/login', { username, password })
    return res.data
  } catch (err) {
    return thunkAPI.rejectWithValue(err.response?.data || { error: 'Login failed' })
  }
})

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setUser(state, action) {
      const { user, token, permissions } = action.payload
      state.user = user
      state.token = token
      state.permissions = permissions || []
      localStorage.setItem('user', JSON.stringify(user))
      localStorage.setItem('token', token)
      localStorage.setItem('permissions', JSON.stringify(permissions || []))
    },
    logout(state) {
      state.user = null
      state.token = null
      state.permissions = []
      localStorage.removeItem('user')
      localStorage.removeItem('token')
      localStorage.removeItem('permissions')
    }
    ,
    clearError(state) {
      state.error = null
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => { state.status = 'loading'; state.error = null })
      .addCase(login.fulfilled, (state, action) => {
        state.status = 'succeeded'
        const { token, user } = action.payload
        state.user = user
        state.token = token
        state.permissions = user.permissions || []
        localStorage.setItem('user', JSON.stringify(user))
        localStorage.setItem('token', token)
        localStorage.setItem('permissions', JSON.stringify(user.permissions || []))
      })
      .addCase(login.rejected, (state, action) => { state.status = 'failed'; state.error = action.payload || action.error })
  }
})

export const { setUser, logout, clearError } = authSlice.actions
export default authSlice.reducer
