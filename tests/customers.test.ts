import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { createCustomer, findCustomerByDocument, searchCustomers, setCustomerActive, updateCustomer } from "@/modules/customers/application/customers";
import type { CustomerInput } from "@/modules/customers/domain/schema";
import { getCustomer, listCustomers } from "@/modules/customers/infrastructure/customers";
import { createTestDb, uid, type TestDb } from "./db";
import { createTestUser, ensureBaseData } from "./fixtures";

const SKIP = Boolean(process.env.SKIP_DB_TESTS);

/** A unique cédula for each call. */
let seq = 0;
function cedula(): string {
  seq += 1;
  return `${(Date.now() % 10_000_000) + seq}`.padStart(8, "1").slice(-8);
}

function person(overrides: Partial<CustomerInput> = {}): CustomerInput {
  return { docType: "V", docNumber: cedula(), firstName: "Ana", lastName: "Pérez", phonePrefix: "0414", phoneNumber: "1234567", ...overrides };
}

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
    const doc = cedula();
    const tech = await createCustomer(person({ docNumber: doc, firstName: "luis", lastName: "técnico", customerType: "technician", email: "TECH@Example.com" }), userId, db);
    created.push(tech.id);
    expect(tech).toMatchObject({ docNumber: doc, name: "Luis Técnico", firstName: "Luis", lastName: "Técnico", phone: "0414-1234567", email: "tech@example.com", kind: "person" });
    expect((await getCustomer(tech.id, db))?.priceListCode).toBe("TECH");

    // Same document typed with dots and the letter: still a duplicate, and the message names the customer.
    await expect(createCustomer(person({ docNumber: `V-${doc.slice(0, 2)}.${doc.slice(2, 5)}.${doc.slice(5)}` }), userId, db)).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("Luis Técnico"),
      details: { fields: { docNumber: expect.any(String) } },
    });
    expect((await findCustomerByDocument("V", `${doc.slice(0, 2)}.${doc.slice(2)}`, db))?.id).toBe(tech.id);

    // Same number under another document type is a different person.
    const other = await createCustomer(person({ docType: "E", docNumber: doc }), userId, db);
    created.push(other.id);
    expect(other.docType).toBe("E");
  });

  it("stores companies with their razón social and the address levels", async () => {
    const rif = `4${cedula()}`;
    const company = await createCustomer(
      { docType: "J", docNumber: `J-${rif}`, companyName: "Refrigeración Los Andes, C.A.", phonePrefix: "0274", phoneNumber: "2441122", state: "Mérida", municipality: "Libertador", parish: "Arias", address: "Av. 3" },
      userId,
      db,
    );
    created.push(company.id);
    expect(company).toMatchObject({ kind: "company", name: "Refrigeración Los Andes, C.A.", firstName: null, docNumber: rif, state: "Mérida", municipality: "Libertador", parish: "Arias" });
    await expect(createCustomer(person({ state: "Narnia" }), userId, db)).rejects.toMatchObject({ code: "VALIDATION", details: { fields: { state: expect.any(String) } } });
  });

  it("requires document, names and phone", async () => {
    await expect(createCustomer({ docType: "V", docNumber: "", firstName: "X" }, userId, db)).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(createCustomer(person({ docType: "J", docNumber: "123" }), userId, db)).rejects.toMatchObject({ code: "VALIDATION", details: { fields: { docNumber: expect.any(String) } } });
    await expect(createCustomer(person({ phoneNumber: "" }), userId, db)).rejects.toMatchObject({ code: "VALIDATION", details: { fields: { phoneNumber: expect.any(String) } } });

    const pub = await createCustomer(person({ email: "" }), userId, db);
    created.push(pub.id);
    expect(pub.email).toBeNull();
    expect((await getCustomer(pub.id, db))?.priceListCode).toBe("PUBLIC");
  });

  it("searches by name, document or phone and lists with filters", async () => {
    const tag = uid("q").replace(/[^a-z]/gi, "").slice(-6);
    const a = await createCustomer(person({ firstName: "Refrigeración", lastName: tag, phoneNumber: "7654321" }), userId, db);
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

  it("updates a customer", async () => {
    const c = await createCustomer(person(), userId, db);
    created.push(c.id);
    const updated = await updateCustomer(c.id, person({ docNumber: c.docNumber!, firstName: "Nombre", lastName: "Nuevo", customerType: "technician" }), userId, db);
    expect(updated.name).toBe("Nombre Nuevo");
    expect((await getCustomer(c.id, db))?.priceListCode).toBe("TECH");
    await expect(updateCustomer("00000000-0000-0000-0000-000000000000", person(), userId, db)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
