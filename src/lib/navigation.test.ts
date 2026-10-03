import { describe, expect, it } from "vitest";
import { mobileNavForRole, sectionForPath } from "./navigation";

const hrefs = (items: Array<{ href: string }>) => items.map((i) => i.href);

describe("mobileNavForRole", () => {
  it("gives each role its four most used sections, in sidebar order, and the rest in Más", () => {
    expect(hrefs(mobileNavForRole("admin").bar)).toEqual(["/inicio", "/vender", "/productos", "/inventario"]);
    expect(hrefs(mobileNavForRole("admin").more)).toEqual(["/ventas", "/compras", "/clientes", "/caja", "/reportes", "/configuracion"]);
    // The warehouse has no Vender: Compras takes its place instead of hiding in Más.
    expect(hrefs(mobileNavForRole("warehouse").bar)).toEqual(["/inicio", "/productos", "/inventario", "/compras"]);
    expect(mobileNavForRole("warehouse").more).toEqual([]);
    expect(hrefs(mobileNavForRole("seller").bar)).toEqual(["/vender", "/productos"]);
  });
});

describe("sectionForPath", () => {
  it("finds the section of nested pages", () => {
    expect(sectionForPath("/productos/123/editar")?.label).toBe("Productos");
    expect(sectionForPath("/cotizaciones/9")?.label).toBe("Ventas");
    expect(sectionForPath("/login")).toBeNull();
  });
});
