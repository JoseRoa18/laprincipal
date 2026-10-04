import { describe, expect, it } from "vitest";
import { docNumberError, formatDoc, normalizeDocNumber } from "./document";
import { formatPhone, phoneError, splitPhone } from "./phone";
import { customerInputSchema, formatAddress, tidyPersonName } from "./schema";

const person = { docType: "V", docNumber: "12.345.678", firstName: "juan  carlos", lastName: "pérez de la cruz", phonePrefix: "0414", phoneNumber: "123-4567" } as const;

describe("customerInputSchema", () => {
  it("builds a person from first and last name, with a tidy name, normalized cédula and phone", () => {
    const d = customerInputSchema.parse(person);
    expect(d).toMatchObject({
      kind: "person",
      docType: "V",
      docNumber: "12345678",
      firstName: "Juan Carlos",
      lastName: "Pérez de la Cruz",
      name: "Juan Carlos Pérez de la Cruz",
      phone: "0414-1234567",
      state: null,
    });
  });

  it("uses the razón social for J and G", () => {
    const d = customerInputSchema.parse({ docType: "J", docNumber: "J-40123456-7", companyName: "Refrigeración Los Andes, C.A.", phonePrefix: "0274", phoneNumber: "2441122" });
    expect(d).toMatchObject({ kind: "company", name: "Refrigeración Los Andes, C.A.", firstName: null, lastName: null, docNumber: "401234567", phone: "0274-2441122" });
  });

  it("requires document, both names and phone, each on its own field", () => {
    const r = customerInputSchema.safeParse({ docType: "V", docNumber: "", firstName: "Ana", lastName: "", phonePrefix: "0414", phoneNumber: "12" });
    expect(r.success).toBe(false);
    const paths = r.error!.issues.map((i) => i.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["docNumber", "lastName", "phoneNumber"]));
    const company = customerInputSchema.safeParse({ docType: "G", docNumber: "200000001", phonePrefix: "", phoneNumber: "1234567" });
    expect(company.error!.issues.map((i) => i.path.join("."))).toEqual(expect.arrayContaining(["companyName", "phonePrefix"]));
  });

  it("keeps the address levels in order", () => {
    const r = customerInputSchema.safeParse({ ...person, parish: "Catedral" });
    expect(r.error!.issues.map((i) => i.path.join("."))).toContain("municipality");
    const d = customerInputSchema.parse({ ...person, state: "Mérida", municipality: "Libertador", parish: "Arias", address: "Calle 25" });
    expect(formatAddress(d)).toBe("Calle 25 · Arias, Libertador, Mérida");
  });
});

describe("documents", () => {
  it("normalizes and formats cédulas and RIF", () => {
    expect(normalizeDocNumber(" v-12.345.678 ", "V")).toBe("12345678");
    expect(normalizeDocNumber("ab123456", "P")).toBe("AB123456");
    expect(formatDoc("J", "401234567")).toBe("J-40123456-7");
    expect(formatDoc("V", "12345678")).toBe("V-12345678");
    expect(formatDoc("NONE", null)).toBe("");
    expect(docNumberError("J", "40123456")).toMatch(/9 números/);
    expect(docNumberError("V", "12345678")).toBeNull();
  });
});

describe("phones", () => {
  it("accepts mobile prefixes and landline area codes", () => {
    expect(phoneError("0424", "1234567")).toBeNull();
    expect(phoneError("0212", "5551234")).toBeNull();
    expect(phoneError("0413", "1234567")).toMatch(/Prefijo/);
    expect(formatPhone("0416", "123 45 67")).toBe("0416-1234567");
  });

  it("splits stored phones for editing, old free text included", () => {
    expect(splitPhone("0414-1234567")).toEqual({ prefix: "0414", number: "1234567" });
    expect(splitPhone("+58 412 765 4321")).toEqual({ prefix: "0412", number: "7654321" });
    expect(splitPhone("1234")).toEqual({ prefix: "", number: "1234" });
  });
});

describe("tidyPersonName", () => {
  it("capitalizes words and keeps particles lower case", () => {
    expect(tidyPersonName("MARÍA DE LOS ÁNGELES")).toBe("María de los Ángeles");
  });
});
