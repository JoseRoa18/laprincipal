import { describe, expect, it } from "vitest";
import { isPlausibleRateChange, parseBcvHomePage, parseDolarApiOfficial } from "./bcv";

// Trimmed from www.bcv.org.ve (Oct 2026): the euro block comes first, then the dollar.
const PAGE = `
<div id="euro" class="col-sm-12 col-xs-12 "><div class="field-content"><div class="row recuadrotsmc">
  <div class="col-sm-6 col-xs-6"><span> EUR</span></div>
  <div class="col-sm-6 col-xs-6 centrado textp"> <strong class="strong-tb"> 1.010,39904073</strong></div></div></div></div>
<div id="dolar" class="col-sm-12 col-xs-12 ">
  <div class="field-content"><div class="row recuadrotsmc">
    <div class="col-sm-6 col-xs-6"><img src="/sites/default/files/dollar-04_2.png" class="icono_bss_blanco1"><span> USD</span></div>
    <div class="col-sm-6 col-xs-6 centrado textp"> <strong class="strong-tb">871,36890000</strong>  </div>
  </div></div>
</div>
<div class="pull-right dinpro center">
Fecha Valor: <span class="date-display-single" property="dc:date" datatype="xsd:dateTime" content="2026-10-05T00:00:00-04:00">Lunes, 05 Octubre  2026</span>
</div>`;

describe("parseBcvHomePage", () => {
  it("reads the dollar (not the euro) and the value date", () => {
    expect(parseBcvHomePage(PAGE)).toEqual({ rate: "871.36890000", valueDate: "2026-10-05" });
  });

  it("returns null when the page changed", () => {
    expect(parseBcvHomePage("<html>mantenimiento</html>")).toBeNull();
    expect(parseBcvHomePage(PAGE.replace(/Fecha Valor:[\s\S]*$/, ""))).toBeNull();
    expect(parseBcvHomePage(PAGE.replace("871,36890000", "0,00"))).toBeNull();
  });
});

describe("parseDolarApiOfficial", () => {
  it("reads the average and the date", () => {
    expect(parseDolarApiOfficial({ moneda: "USD", fuente: "oficial", promedio: 866.5612, fechaActualizacion: "2026-10-02T00:00:00-04:00" })).toEqual({
      rate: "866.5612",
      valueDate: "2026-10-02",
    });
  });

  it("rejects incomplete answers", () => {
    expect(parseDolarApiOfficial(null)).toBeNull();
    expect(parseDolarApiOfficial({ promedio: null, fechaActualizacion: "2026-10-02" })).toBeNull();
    expect(parseDolarApiOfficial({ promedio: 866.5 })).toBeNull();
  });
});

describe("isPlausibleRateChange", () => {
  it("accepts normal moves and rejects misreads", () => {
    expect(isPlausibleRateChange(null, "871.37")).toBe(true);
    expect(isPlausibleRateChange("866.56", "871.37")).toBe(true);
    expect(isPlausibleRateChange("866.56", "1010.40")).toBe(true);
    expect(isPlausibleRateChange("866.56", "87.13")).toBe(false);
    expect(isPlausibleRateChange("866.56", "8713.69")).toBe(false);
  });
});
