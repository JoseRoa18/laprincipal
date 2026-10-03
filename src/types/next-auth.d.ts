import type { DefaultSession } from "next-auth";
import type { UserRole } from "@/db/schema/enums";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
      /** users.session_version when the session started. */
      sv: number;
    } & DefaultSession["user"];
  }

  interface User {
    role?: UserRole;
    sessionVersion?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: UserRole;
    sv?: number;
  }
}
