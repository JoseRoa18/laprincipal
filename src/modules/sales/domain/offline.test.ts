import { describe, expect, it } from "vitest";
import { findByBarcodeOffline, findCustomerOffline, priceOffline, provisionalNumber, searchOffline, type OfflineCustomer, type OfflineProduct } from "./offline";

function product(overrides: Partial<OfflineProduct>): OfflineProduct {
  return {
    id: "p1",
    sku: "EMB-123",
    name: "Compresor Embraco 1/3 HP",
    unitSymbol: "u",
    unitDecimals: 0,
    taxRate: "0.16",
    publicPriceUsd: "120.00",
    techPriceUsd: "108.00",
    stockAvailable: "3.000",
    stockPhysical: "3.000",
    locationCode: "P2-E3",
    thumbUrl: null,
    searchText: "compresor embraco 1/3 hp | emb-123 | emb123 | embraco",
    barcodes: ["7591234567890"],
    ...overrides,
  };
}

const catalog = [
  product({}),
  product({ id: "p2", sku: "LP-000002", name: "Relé universal", searchText: "rele universal | lp-000002 | lp000002", barcodes: [], publicPriceUsd: null, techPriceUsd: null }),
];

describe("searchOffline", () => {
  it("finds an exact barcode or code first", () => {
    expect(searchOffline(catalog, "7591234567890").map((p) => p.id)).toEqual(["p1"]);
    expect(searchOffline(catalog, "emb 123").map((p) => p.id)).toEqual(["p1"]);
    expect(findByBarcodeOffline(catalog, "7591234567890")?.id).toBe("p1");
    expect(findByBarcodeOffline(catalog, "000")).toBeNull();
  });

  it("matches every word in any order, without accents", () => {
    expect(searchOffline(catalog, "1/3 COMPRESOR").map((p) => p.id)).toEqual(["p1"]);
    expect(searchOffline(catalog, "relé").map((p) => p.id)).toEqual(["p2"]);
    expect(searchOffline(catalog, "compresor rele")).toEqual([]);
    expect(searchOffline(catalog, "  ")).toEqual([]);
  });
});

describe("priceOffline", () => {
  it("gives technicians the technician price and keeps unpriced products unpriced", () => {
    expect(priceOffline(catalog[0], "public")).toMatchObject({ priceUsd: "120.00", priceListCode: "PUBLIC" });
    expect(priceOffline(catalog[0], "technician")).toMatchObject({ priceUsd: "108.00", priceListCode: "TECH" });
    expect(priceOffline(product({ techPriceUsd: null }), "technician")).toMatchObject({ priceUsd: "120.00", priceListCode: "PUBLIC" });
    expect(priceOffline(catalog[1], "public")).toMatchObject({ priceUsd: null, priceListCode: null });
  });
});

describe("customers and numbers", () => {
  it("finds a saved customer however the cédula is typed", () => {
    const customers: OfflineCustomer[] = [
      { id: "c1", name: "Ana Pérez", docType: "V", docNumber: "12345678", doc: "V-12345678", phone: null, customerType: "public", priceListId: null },
    ];
    expect(findCustomerOffline(customers, "V", "V-12.345.678")?.id).toBe("c1");
    expect(findCustomerOffline(customers, "E", "12345678")).toBeNull();
    expect(provisionalNumber(7)).toBe("P-0007");
  });
});
