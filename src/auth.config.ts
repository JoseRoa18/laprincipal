import type { NextAuthConfig } from "next-auth";
import type { UserRole } from "@/db/schema/enums";

/**
 * Edge-safe part of the Auth.js configuration (no database access).
 * Used by `src/proxy.ts` and extended with providers in `src/auth.ts`.
 */
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  trustHost: true,
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = (user as { role?: UserRole }).role ?? "seller";
        token.name = user.name;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as UserRole;
      session.user.name = (token.name as string | null) ?? session.user.name;
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
