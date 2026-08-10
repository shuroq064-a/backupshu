import { configureStore } from "@reduxjs/toolkit";
import { useDispatch, useSelector, TypedUseSelectorHook } from "react-redux";
import authReducer from "./slices/authSlice";
import adminReducer from "./slices/adminSlice";
import { setCachedToken } from "@/lib/auth";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    admin: adminReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false, // allow non-serializable dates etc.
    }),
});

// Keep the API token cache in lockstep with this tab's auth state, so every
// request authenticates as the user whose UI data is being used. Without this,
// getToken() re-read the shared localStorage session on every call, letting
// stale tabs (other account logged in elsewhere on the same machine) create
// bookings with a foreign token + this tab's profile — the "bookings merged
// across accounts" bug.
store.subscribe(() => {
  setCachedToken(store.getState().auth.token);
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Typed hooks — use these everywhere instead of plain useDispatch/useSelector
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;