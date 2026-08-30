"use client";

import { useActionState } from "react";
import { loginAction } from "../actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, null);
  return (
    <form action={action}>
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" autoFocus placeholder="leave empty for the operator password" />
      <label htmlFor="password">Password</label>
      <input id="password" name="password" type="password" required />
      {state?.error && <p className="error">{state.error}</p>}
      <button type="submit" disabled={pending}>
        {pending ? "Checking…" : "Sign in"}
      </button>
    </form>
  );
}
