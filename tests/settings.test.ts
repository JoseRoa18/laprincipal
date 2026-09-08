import { compare } from "bcryptjs";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { verifyUserPin } from "@/modules/auth/application/pin";
import { getRatesSnapshot, listRateHistory, upsertRate } from "@/modules/currency/infrastructure/rates";
import { createUser, createUserSchema, updateUser } from "@/modules/settings/application/users";
import { getSetting, saveSetting } from "@/modules/settings/infrastructure/settings";
import { createTestDb, uid, type TestDb } from "./db";
import { createTestUser, ensureBaseData } from "./fixtures";

const SKIP = Boolean(process.env.SKIP_DB_TESTS);

describe.skipIf(SKIP)("settings", () => {
  let db: TestDb;
  let close: () => Promise<void>;
  let adminId: string;
  const rateDates: string[] = [];
  const createdUsers: string[] = [];

  beforeAll(async () => {
    ({ db, close } = createTestDb());
    await ensureBaseData(db);
    adminId = (await createTestUser(db, "admin")).id;
  });

  afterAll(async () => {
    if (rateDates.length) await db.delete(s.exchangeRates).where(inArray(s.exchangeRates.effectiveDate, rateDates));
    // Users referenced by audit_logs cannot be deleted (append-only log); deactivate them instead.
    if (createdUsers.length) await db.update(s.users).set({ isActive: false }).where(inArray(s.users.id, createdUsers));
    await close();
  });

  it("upserting a rate replaces the value of the same day and keeps history", async () => {
    // Far-future dates so this never interferes with the "current" rate of other tests.
    const day1 = "2099-01-10";
    const day2 = "2099-01-11";
    rateDates.push(day1, day2);

    await upsertRate({ currencyCode: "VES", rate: "36.500000", effectiveDate: day1, userId: adminId }, db);
    await upsertRate({ currencyCode: "VES", rate: "36.900000", effectiveDate: day1, userId: adminId }, db);
    await upsertRate({ currencyCode: "VES", rate: "37.100000", effectiveDate: day2, userId: adminId }, db);

    const rows = await db
      .select()
      .from(s.exchangeRates)
      .where(and(eq(s.exchangeRates.currencyCode, "VES"), inArray(s.exchangeRates.effectiveDate, [day1, day2])));
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.effectiveDate === day1)?.rate).toBe("36.900000");

    const snap = await getRatesSnapshot(day2, db);
    expect(snap.rates.find((r) => r.currencyCode === "VES")?.rate).toBe("37.100000");
    expect(snap.stale).not.toContain("VES");

    const history = await listRateHistory("VES", 5, db);
    expect(history[0].effectiveDate).toBe(day2);
  });

  it("creates a user with lower-cased email, hashed password and PIN", async () => {
    const email = `${uid("User")}@Example.COM`;
    const input = createUserSchema.parse({ name: "Vendedora", email, role: "seller", password: "Clave2050*", passwordConfirm: "Clave2050*", pin: "4321" });
    const user = await createUser(input, adminId, db);
    createdUsers.push(user.id);
    expect(user.email).toBe(email.toLowerCase());
    expect(user.role).toBe("seller");

    const [row] = await db.select().from(s.users).where(eq(s.users.id, user.id));
    expect(row.passwordHash).not.toContain("Clave2050*");
    expect(await compare("Clave2050*", row.passwordHash)).toBe(true);
    expect(row.pinHash).toBeTruthy();
    expect(await verifyUserPin(user.id, "4321", db)).toBe(true);
    expect(await verifyUserPin(user.id, "0000", db)).toBe(false);

    await expect(createUser({ ...input, email: email.toUpperCase() }, adminId, db)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(() => createUserSchema.parse({ ...input, passwordConfirm: "otra" })).toThrow();
    expect(() => createUserSchema.parse({ ...input, pin: "12" })).toThrow();
  });

  it("protects the last admin and the actor's own account", async () => {
    const victim = await createUser(
      createUserSchema.parse({ name: "Otro admin", email: `${uid("adm")}@test.local`, role: "admin", password: "Clave2050*", passwordConfirm: "Clave2050*", pin: "1111" }),
      adminId,
      db,
    );
    createdUsers.push(victim.id);
    // Demoting another admin is fine while more admins remain active.
    const demoted = await updateUser(victim.id, { name: "Otro", role: "warehouse", isActive: true }, adminId, db);
    expect(demoted.role).toBe("warehouse");

    await expect(updateUser(adminId, { name: "Yo", role: "admin", isActive: false }, adminId, db)).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(updateUser(adminId, { name: "Yo", role: "seller", isActive: true }, adminId, db)).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("saves and reads typed settings", async () => {
    const before = await getSetting("printing", db);
    const saved = await saveSetting("printing", { ...before, ticketWidthMm: 58, footer: "Gracias" }, adminId, db);
    expect(saved.ticketWidthMm).toBe(58);
    expect((await getSetting("printing", db)).footer).toBe("Gracias");
    await saveSetting("printing", before, adminId, db);
  });
});
