import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { createCustomer, searchCustomers, setCustomerActive, updateCustomer } from "@/modules/customers/application/customers";
import { getCustomer, listCustomers } from "@/modules/customers/infrastructure/customers";
import { createTestDb, uid, type TestDb } from "./db";
import { createTestUser, ensureBaseData } from "./fixtures";

const SKIP = Boolean(process.env.SKIP_DB_TESTS);

describe.skipIf(SKIP)("customers", () => {
  let db: TestDb;
  let close: () => Promise<void>;
  let userId: string;
  const created: string[] = [];

  beforeAll(async () => {
    ({ db, close } = createTestDb());
    await ensureBaseData(db);
    userId = (await createTestUser(db, "seller")).id;
  });

  afterAll(async () => {
    if (created.length) await db.delete(s.customers).where(inArray(s.customers.id, created));
    await close();
  });

  it("creates a customer, assigns the price list by type and enforces the unique document", async () => {
    const doc = uid("9").replace(/\D/g, "").slice(0, 9) || "123456789";
    const tech = await createCustomer(
      { name: `Técnico ${doc}`, docType: "V", docNumber: doc, customerType: "technician", phone: "0414-0000000", email: "TECH@Example.com" },
      userId,
      db,
    );
    created.push(tech.id);
    expect(tech.docNumber).toBe(doc);
    expect(tech.email).toBe("tech@example.com");

    const detail = await getCustomer(tech.id, db);
    expect(detail?.priceListCode).toBe("TECH");

    await expect(createCustomer({ name: "Duplicado", docType: "V", docNumber: doc }, userId, db)).rejects.toMatchObject({
      code: "CONFLICT",
      details: { fields: { docNumber: expect.any(String) } },
    });

    // Same number under another document type is a different person.
    const other = await createCustomer({ name: "Otro", docType: "E", docNumber: doc }, userId, db);
    created.push(other.id);
    expect(other.docType).toBe("E");
  });

  it("validates input and defaults the public list", async () => {
    await expect(createCustomer({ name: "X" }, userId, db)).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(createCustomer({ name: "Sin número", docType: "J" }, userId, db)).rejects.toMatchObject({ code: "VALIDATION", details: { fields: { docNumber: expect.any(String) } } });

    const pub = await createCustomer({ name: `Cliente ${uid()}`, email: "" }, userId, db);
    created.push(pub.id);
    expect(pub.docType).toBe("NONE");
    expect(pub.docNumber).toBeNull();
    expect(pub.email).toBeNull();
    expect((await getCustomer(pub.id, db))?.priceListCode).toBe("PUBLIC");
  });

  it("searches by name, document or phone and lists with filters", async () => {
    const tag = uid("q").replace(/-/g, "");
    const a = await createCustomer({ name: `Refrigeración ${tag}`, phone: `0412${tag.slice(-4)}`, docType: "V", docNumber: `${Date.now()}`.slice(-8) }, userId, db);
    created.push(a.id);

    expect((await searchCustomers(`refrigeracion ${tag}`, 5, db)).map((c) => c.id)).toContain(a.id);
    expect((await searchCustomers(a.phone!, 5, db)).map((c) => c.id)).toContain(a.id);
    expect((await searchCustomers(a.docNumber!, 5, db)).map((c) => c.id)).toContain(a.id);
    expect(await searchCustomers("   ", 5, db)).toEqual([]);

    const list = await listCustomers({ q: tag, page: 1, pageSize: 10 }, db);
    expect(list.total).toBe(1);
    expect(list.rows[0].id).toBe(a.id);
    expect((await listCustomers({ q: tag, type: "technician", page: 1, pageSize: 10 }, db)).total).toBe(0);

    await setCustomerActive(a.id, false, userId, db);
    expect((await listCustomers({ q: tag, page: 1, pageSize: 10 }, db)).total).toBe(0);
    expect((await listCustomers({ q: tag, includeInactive: true, page: 1, pageSize: 10 }, db)).total).toBe(1);
    expect(await searchCustomers(tag, 5, db)).toEqual([]);
  });

  it("updates a customer and clears the document when set to NONE", async () => {
    const c = await createCustomer({ name: `Editar ${uid()}`, docType: "V", docNumber: `${Date.now()}`.slice(-7) }, userId, db);
    created.push(c.id);
    const updated = await updateCustomer(c.id, { name: "Nombre nuevo", docType: "NONE", docNumber: "999", customerType: "technician" }, userId, db);
    expect(updated.name).toBe("Nombre nuevo");
    expect(updated.docNumber).toBeNull();
    expect((await getCustomer(c.id, db))?.priceListCode).toBe("TECH");
    await expect(updateCustomer("00000000-0000-0000-0000-000000000000", { name: "Nadie" }, userId, db)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
