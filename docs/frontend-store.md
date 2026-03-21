# Frontend — Auth Store (Redux)

Responsibilities
- Hold authentication state, user info, and permissions. Provide reducers/actions to login, logout, and persist auth to `localStorage`.

Key file
- `frontend/src/store/authSlice.js` — contains the `auth` slice used by the app, and its reducer is registered in `frontend/src/store/store.js`.

Behavior
- Stores token and user details; components and `ProtectedRoute` consult this slice to decide whether to render protected content.
- When the API client logs out (on 401), it should also dispatch a logout action to keep Redux in sync.

Recommendation
- Ensure single source of truth: on logout clear both Redux state and `localStorage` to avoid stale state.
