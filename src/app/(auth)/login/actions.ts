"use server";

import { AuthError, CredentialsSignin } from "next-auth";
import { signIn } from "@/auth";

export interface LoginState {
  error?: string;
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "");
  const redirectTo = next.startsWith("/") && !next.startsWith("//") ? next : "/inicio";

  try {
    await signIn("credentials", { email, password, redirectTo });
    return {};
  } catch (err) {
    if (err instanceof CredentialsSignin) {
      return {
        error: err.code === "locked" ? "Demasiados intentos fallidos. Espera unos minutos e intenta de nuevo." : "Correo o contraseña incorrectos.",
      };
    }
    if (err instanceof AuthError) {
      // Database or network failure while checking: not the user's password.
      console.error("[login]", err);
      return { error: "No se pudo iniciar sesión. Revisa la conexión e intenta de nuevo." };
    }
    // signIn throws a redirect on success; let Next handle it.
    throw err;
  }
}
