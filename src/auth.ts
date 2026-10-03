import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { authConfig } from "./auth.config";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { clearAttempts, reserveAttempt } from "@/modules/auth/application/throttle";
import { LOGIN_EMAIL_POLICY, LOGIN_IP_POLICY } from "@/modules/auth/domain/throttle";

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

/** Too many failed attempts for this e-mail or from this IP. */
export class LoginLockedError extends CredentialsSignin {
  code = "locked";
}

/** Compared when the e-mail does not exist, so the answer takes as long as a real check. */
const DUMMY_HASH = "$2b$10$HgjIfA6cP8xsn3TUxtY4COAN5lVMna/eEhfKnj227AI8OOppN9Ewq";

function clientIp(request: Request | undefined): string | null {
  const h = request?.headers;
  return h?.get("x-real-ip") ?? h?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw, request) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        // Count the attempt first (atomic), so parallel guesses are throttled too.
        const emailKey = `login:${email}`;
        const ip = clientIp(request);
        const ipKey = ip ? `login-ip:${ip}` : null;
        if (await reserveAttempt(emailKey, LOGIN_EMAIL_POLICY)) throw new LoginLockedError();
        if (ipKey && (await reserveAttempt(ipKey, LOGIN_IP_POLICY))) throw new LoginLockedError();

        const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
        const ok = await compare(password, user?.passwordHash ?? DUMMY_HASH);
        if (!user || !user.isActive || !ok) return null;

        await clearAttempts(emailKey);
        if (ipKey) await clearAttempts(ipKey);
        await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

        return { id: user.id, name: user.name, email: user.email, role: user.role, sessionVersion: user.sessionVersion };
      },
    }),
  ],
});
