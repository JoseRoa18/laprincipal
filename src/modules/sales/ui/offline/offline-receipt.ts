"use client";

import { formatMoney, formatQty } from "@/lib/format";
import { formatChange } from "../../domain/payments";
import type { OfflineReceipt } from "./offline-store";

const esc = (text: string) => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Provisional ticket of a sale saved without a connection, printed from the
 * browser with no server: it says it is provisional and shows the P- number
 * the sale keeps until the server gives it its V- number.
 */
export function offlineReceiptHtml(r: OfflineReceipt, company: { name: string; taxId: string; address: string; phone: string } | null): string {
  const row = (label: string, value: string, bold = false) =>
    `<div class="row${bold ? " b" : ""}"><span>${esc(label)}</span><span>${esc(value)}</span></div>`;
  const lines = r.lines
    .map(
      (l) =>
        `<div class="item"><div>${esc(l.name)}</div>${row(`${formatQty(l.quantity, l.unitDecimals)} ${l.unitSymbol} × ${formatMoney(l.unitPriceUsd, "USD")}`, formatMoney(l.totalUsd, "USD"))}</div>`,
    )
    .join("");
  const payments = r.payments.map((p) => row(`${p.name}${p.reference ? ` (${p.reference})` : ""}`, formatMoney(p.amount, p.currencyCode))).join("");
  const when = new Date(r.soldAt).toLocaleString("es-VE", { dateStyle: "short", timeStyle: "short" });
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(r.number)}</title><style>
    @page { size: 80mm auto; margin: 4mm; }
    body { font: 12px/1.35 system-ui, sans-serif; width: 72mm; margin: 0 auto; color: #000; }
    h1 { font-size: 14px; margin: 0; text-align: center; }
    .c { text-align: center; } .muted { color: #333; font-size: 11px; }
    .row { display: flex; justify-content: space-between; gap: 8px; } .b { font-weight: 700; }
    .item { margin: 4px 0; } hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
    .tag { border: 1px solid #000; padding: 2px 4px; margin: 6px 0; text-align: center; font-weight: 700; }
  </style></head><body>
    <h1>${esc(company?.name ?? "")}</h1>
    ${company?.taxId ? `<div class="c muted">RIF ${esc(company.taxId)}</div>` : ""}
    ${company?.address ? `<div class="c muted">${esc(company.address)}</div>` : ""}
    ${company?.phone ? `<div class="c muted">${esc(company.phone)}</div>` : ""}
    <div class="tag">COMPROBANTE PROVISIONAL ${esc(r.number)}<br><span class="muted">Venta hecha sin conexión: se registra al volver internet</span></div>
    ${row("Fecha", when)}
    ${row("Cliente", `${r.customer.name}${r.customer.doc ? ` · ${r.customer.doc}` : ""}`)}
    ${row("Vendedor", r.sellerName)}
    <hr>${lines}<hr>
    ${row("Subtotal", formatMoney(r.totals.subtotalUsd, "USD"))}
    ${Number(r.totals.discountUsd) > 0 ? row("Descuento", `-${formatMoney(r.totals.discountUsd, "USD")}`) : ""}
    ${row("IVA incluido", formatMoney(r.totals.taxUsd, "USD"))}
    ${row("TOTAL", formatMoney(r.totals.totalUsd, "USD"), true)}
    ${r.rates.VES ? row("En bolívares", formatMoney(Number(r.totals.totalUsd) * Number(r.rates.VES), "VES")) : ""}
    <hr>${payments}
    ${r.changeParts.length ? row("Cambio", formatChange(r.changeParts), true) : ""}
  </body></html>`;
}

/** Print through a hidden frame: works offline and is not stopped by popup blockers. */
export function printOfflineReceipt(r: OfflineReceipt, company: { name: string; taxId: string; address: string; phone: string } | null) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  Object.assign(frame.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc || !frame.contentWindow) return frame.remove();
  doc.open();
  doc.write(offlineReceiptHtml(r, company));
  doc.close();
  frame.contentWindow.focus();
  frame.contentWindow.print();
  window.setTimeout(() => frame.remove(), 2000);
}
