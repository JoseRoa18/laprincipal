import { compare, hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import type { z } from "zod";
import { db, type Db } from "@/db/client";
import { users } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { setUserPin } from "@/modules/auth/application/pin";
import { countActiveAdmins } from "@/modules/auth/infrastructure/users";
import { writeAudit } from "@/modules/core/application/audit";
import { isUniqueViolation } from "@/modules/core/application/db-errors";
import type { createUserSchema, updateUserSchema } from "../domain/user-forms";

// Schemas live in the domain so client forms can import them without pulling the database client.
export {
  changeOwnPasswordSchema,
  createUserSchema,
  emailSchema,
  passwordSchema,
  pinSchema,
  resetPasswordSchema,
  roleSchema,
  setPinSchema,
  updateUserSchema,
  type ChangeOwnPasswordInput,
  type CreateUserInput,
  type ResetPasswordInput,
  type SetPinInput,
  type UpdateUserInput,
} from "../domain/user-forms";

const DUPLICATE_EMAIL = "Ya existe un usuario con ese correo.";

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: "admin" | "seller" | "warehouse";
  isActive: boolean;
}

const publicColumns = { id: users.id, name: users.name, email: users.email, role: users.role, isActive: users.isActive };

/** Admin creates a user. Email is stored lower-cased; password and PIN are hashed. */
export async function createUser(input: z.output<typeof createUserSchema>, actorId: string, dbx: Db = db): Promise<PublicUser> {
  return dbx.transaction(async (tx) => {
    let row: PublicUser;
    try {
      [row] = await tx
        .insert(users)
        .values({ name: input.name.trim(), email: input.email.trim().toLowerCase(), role: input.role, passwordHash: await hash(input.password, 10) })
        .returning(publicColumns);
    } catch (err) {
      if (isUniqueViolation(err)) throw new AppError("CONFLICT", DUPLICATE_EMAIL, { fields: { email: DUPLICATE_EMAIL } });
      throw err;
    }
    await setUserPin(row.id, input.pin, tx);
    await writeAudit(tx, { userId: actorId, action: "user.create", entityType: "user", entityId: row.id, after: row });
    return row;
  });
}

export async function updateUser(id: string, input: z.output<typeof updateUserSchema>, actorId: string, dbx: Db = db): Promise<PublicUser> {
  return dbx.transaction(async (tx) => {
    const [before] = await tx.select(publicColumns).from(users).where(eq(users.id, id)).limit(1);
    if (!before) throw new AppError("NOT_FOUND", "El usuario no existe.");

    if (id === actorId && !input.isActive) throw new AppError("VALIDATION", "No puedes desactivar tu propio usuario.");
    if (id === actorId && input.role !== "admin") throw new AppError("VALIDATION", "No puedes quitarte el rol de administrador.");

    const losesAdmin = before.role === "admin" && before.isActive && (input.role !== "admin" || !input.isActive);
    if (losesAdmin && (await countActiveAdmins(tx)) <= 1) {
      throw new AppError("VALIDATION", "Debe quedar al menos un administrador activo.");
    }

    const [row] = await tx
      .update(users)
      .set({ name: input.name, role: input.role, isActive: input.isActive })
      .where(eq(users.id, id))
      .returning(publicColumns);
    await writeAudit(tx, { userId: actorId, action: "user.update", entityType: "user", entityId: id, before, after: row });
    return row;
  });
}

export async function resetUserPassword(id: string, password: string, actorId: string, dbx: Db = db): Promise<void> {
  return dbx.transaction(async (tx) => {
    const [row] = await tx.select(publicColumns).from(users).where(eq(users.id, id)).limit(1);
    if (!row) throw new AppError("NOT_FOUND", "El usuario no existe.");
    await tx.update(users).set({ passwordHash: await hash(password, 10) }).where(eq(users.id, id));
    await writeAudit(tx, { userId: actorId, action: "user.update", entityType: "user", entityId: id, after: { passwordReset: true } });
  });
}

export async function resetUserPin(id: string, pin: string, actorId: string, dbx: Db = db): Promise<void> {
  return dbx.transaction(async (tx) => {
    const [row] = await tx.select(publicColumns).from(users).where(eq(users.id, id)).limit(1);
    if (!row) throw new AppError("NOT_FOUND", "El usuario no existe.");
    await setUserPin(id, pin, tx);
    await writeAudit(tx, { userId: actorId, action: "user.update", entityType: "user", entityId: id, after: { pinReset: true } });
  });
}

/** Any signed-in user changes their own password after proving the current one. */
export async function changeOwnPassword(userId: string, currentPassword: string, password: string, dbx: Db = db): Promise<void> {
  return dbx.transaction(async (tx) => {
    const [row] = await tx.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, userId)).limit(1);
    if (!row) throw new AppError("NOT_FOUND", "El usuario no existe.");
    if (!(await compare(currentPassword, row.passwordHash))) {
      throw new AppError("VALIDATION", "La contraseña actual no es correcta.", { fields: { currentPassword: "Contraseña incorrecta" } });
    }
    await tx.update(users).set({ passwordHash: await hash(password, 10) }).where(eq(users.id, userId));
    await writeAudit(tx, { userId, action: "user.update", entityType: "user", entityId: userId, after: { passwordChanged: true } });
  });
}

export async function changeOwnPin(userId: string, pin: string, dbx: Db = db): Promise<void> {
  return dbx.transaction(async (tx) => {
    await setUserPin(userId, pin, tx);
    await writeAudit(tx, { userId, action: "user.update", entityType: "user", entityId: userId, after: { pinChanged: true } });
  });
}
