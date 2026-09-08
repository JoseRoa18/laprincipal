import { z } from "zod";

/**
 * Zod schemas for user management and "Mi cuenta". Pure module (no database
 * imports) so client forms can share them with the server actions.
 */

/** Same rule as `src/modules/auth/application/pin.ts`. */
export const PIN_REGEX = /^\d{4,6}$/;

export const roleSchema = z.enum(["admin", "seller", "warehouse"]);
export const passwordSchema = z.string().min(8, "La contraseña debe tener al menos 8 caracteres").max(100);
export const pinSchema = z.string().regex(PIN_REGEX, "El PIN debe tener entre 4 y 6 dígitos");
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Correo inválido"));

export const createUserSchema = z
  .object({
    name: z.string().trim().min(2, "Escribe el nombre").max(100),
    email: emailSchema,
    role: roleSchema,
    password: passwordSchema,
    passwordConfirm: z.string(),
    pin: pinSchema,
  })
  .refine((d) => d.password === d.passwordConfirm, { path: ["passwordConfirm"], message: "Las contraseñas no coinciden" });
export type CreateUserInput = z.input<typeof createUserSchema>;

export const updateUserSchema = z.object({
  name: z.string().trim().min(2, "Escribe el nombre").max(100),
  role: roleSchema,
  isActive: z.boolean(),
});
export type UpdateUserInput = z.input<typeof updateUserSchema>;

export const resetPasswordSchema = z
  .object({ password: passwordSchema, passwordConfirm: z.string() })
  .refine((d) => d.password === d.passwordConfirm, { path: ["passwordConfirm"], message: "Las contraseñas no coinciden" });
export type ResetPasswordInput = z.input<typeof resetPasswordSchema>;

export const changeOwnPasswordSchema = z
  .object({ currentPassword: z.string().min(1, "Escribe tu contraseña actual"), password: passwordSchema, passwordConfirm: z.string() })
  .refine((d) => d.password === d.passwordConfirm, { path: ["passwordConfirm"], message: "Las contraseñas no coinciden" });
export type ChangeOwnPasswordInput = z.input<typeof changeOwnPasswordSchema>;

export const setPinSchema = z
  .object({ pin: pinSchema, pinConfirm: z.string() })
  .refine((d) => d.pin === d.pinConfirm, { path: ["pinConfirm"], message: "Los PIN no coinciden" });
export type SetPinInput = z.input<typeof setPinSchema>;
