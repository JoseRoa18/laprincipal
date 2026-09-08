import { and, count, eq, isNotNull } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { users, type UserRole } from "@/db/schema";

export interface UserListRow {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  hasPin: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}

// Re-exported for server pages; the pure definition lives in the domain so client code can share it.
export { ROLE_LABEL } from "../domain/roles";

export async function listUsers(dbx: DbOrTx = db): Promise<UserListRow[]> {
  const rows = await dbx
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      isActive: users.isActive,
      pinHash: users.pinHash,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(users.name);
  return rows.map(({ pinHash, ...u }) => ({ ...u, hasPin: Boolean(pinHash) }));
}

export async function getUserById(id: string, dbx: DbOrTx = db) {
  const [row] = await dbx.select().from(users).where(eq(users.id, id)).limit(1);
  return row ?? null;
}

export async function countActiveAdmins(dbx: DbOrTx = db): Promise<number> {
  const [{ n }] = await dbx
    .select({ n: count() })
    .from(users)
    .where(and(eq(users.role, "admin"), eq(users.isActive, true)));
  return n;
}

/** Public profile of the signed-in user for "Mi cuenta". */
export async function getOwnProfile(id: string, dbx: DbOrTx = db) {
  const [row] = await dbx
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, pinHash: users.pinHash, lastLoginAt: users.lastLoginAt })
    .from(users)
    .where(and(eq(users.id, id), isNotNull(users.id)))
    .limit(1);
  if (!row) return null;
  const { pinHash, ...profile } = row;
  return { ...profile, hasPin: Boolean(pinHash) };
}
