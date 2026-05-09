import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import api, { setApiToken } from '../api/api'

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
    if (!err.response) {
      const apiBase = api.defaults?.baseURL || 'the backend server'
      return thunkAPI.rejectWithValue({
        error: `Cannot connect to ${apiBase}. Make sure the backend server is running.`
      })
    }
    return thunkAPI.rejectWithValue(err.response?.data || { error: 'Login failed' })
  }
})

export const refreshPermissions = createAsyncThunk('auth/refreshPermissions', async (_, thunkAPI) => {
  try {
    const res = await api.get('/auth/me')
    return res.data
  } catch (err) {
    // Silently fail — don't force logout, just keep existing permissions
    return thunkAPI.rejectWithValue(null)
  }
})

export const logoutUser = createAsyncThunk('auth/logoutUser', async (_, thunkAPI) => {
  try {
    await api.post('/auth/logout')
  } catch (err) {
    // Always continue local logout even when API logout fails.
  }

  thunkAPI.dispatch({ type: 'auth/logout' })
  return true
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
      setApiToken(token)
      localStorage.setItem('user', JSON.stringify(user))
      localStorage.setItem('token', token)
      localStorage.setItem('permissions', JSON.stringify(permissions || []))
    },
    logout(state) {
      state.user = null
      state.token = null
      state.permissions = []
      setApiToken(null)
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
        setApiToken(token)
        localStorage.setItem('user', JSON.stringify(user))
        localStorage.setItem('token', token)
        localStorage.setItem('permissions', JSON.stringify(user.permissions || []))
      })
      .addCase(login.rejected, (state, action) => { state.status = 'failed'; state.error = action.payload || action.error })
      .addCase(refreshPermissions.fulfilled, (state, action) => {
        const { permissions, roles } = action.payload
        state.permissions = permissions || []
        if (state.user) {
          state.user = { ...state.user, roles: roles || state.user.roles }
        }
        localStorage.setItem('permissions', JSON.stringify(permissions || []))
        localStorage.setItem('user', JSON.stringify(state.user))
      })
  }
})

export const { setUser, logout, clearError } = authSlice.actions
export default authSlice.reducer
