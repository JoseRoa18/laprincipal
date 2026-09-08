import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { formatDateTime, formatMoney, formatQty } from "@/lib/format";
import { D } from "@/lib/money";
import type { CompanySettings, PrintingSettings } from "@/modules/settings/infrastructure/settings";
import { formatDateOnly } from "../../application/labels";
import type { QuoteDetail } from "../quotes-queries";
import type { SaleDetail } from "../sales-queries";

/**
 * A4 documents rendered on the server with @react-pdf/renderer. Plain
 * function components without hooks, so they work with the externalized
 * React copy used by the PDF reconciler.
 */

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: "Helvetica", color: "#111" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16 },
  company: { fontSize: 15, fontFamily: "Helvetica-Bold" },
  muted: { color: "#555" },
  title: { fontSize: 14, fontFamily: "Helvetica-Bold", textAlign: "right" },
  block: { marginBottom: 12, flexDirection: "row", justifyContent: "space-between" },
  label: { color: "#555" },
  table: { borderTopWidth: 1, borderColor: "#999", marginTop: 8 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: "#ccc", paddingVertical: 4 },
  head: { flexDirection: "row", borderBottomWidth: 1, borderColor: "#999", paddingVertical: 4, fontFamily: "Helvetica-Bold" },
  cQty: { width: "10%" },
  cDesc: { width: "46%" },
  cPrice: { width: "15%", textAlign: "right" },
  cDisc: { width: "13%", textAlign: "right" },
  cTotal: { width: "16%", textAlign: "right" },
  totals: { marginTop: 10, alignSelf: "flex-end", width: 220 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  totalBold: { fontFamily: "Helvetica-Bold", fontSize: 12, borderTopWidth: 1, borderColor: "#999", paddingTop: 4, marginTop: 2 },
  section: { marginTop: 14 },
  sectionTitle: { fontFamily: "Helvetica-Bold", marginBottom: 4 },
  footer: { position: "absolute", bottom: 24, left: 36, right: 36, textAlign: "center", color: "#555", fontSize: 9 },
});

function Header({ company, title, number }: { company: CompanySettings; title: string; number: string | null }) {
  return (
    <View style={styles.header}>
      <View>
        <Text style={styles.company}>{company.name}</Text>
        {company.taxId ? <Text style={styles.muted}>RIF {company.taxId}</Text> : null}
        {company.address ? <Text style={styles.muted}>{company.address}</Text> : null}
        {company.phone ? <Text style={styles.muted}>Tel. {company.phone}</Text> : null}
      </View>
      <View>
        <Text style={styles.title}>{title}</Text>
        <Text style={{ textAlign: "right", fontSize: 12 }}>{number ?? ""}</Text>
      </View>
    </View>
  );
}

function LinesTable({
  items,
}: {
  items: { id: string; description: string; partNumber: string | null; quantity: string; unitDecimals: number; unitSymbol: string; unitPriceUsd: string; discountUsd?: string; lineTotalUsd: string }[];
}) {
  return (
    <View style={styles.table}>
      <View style={styles.head}>
        <Text style={styles.cQty}>Cant.</Text>
        <Text style={styles.cDesc}>Descripción</Text>
        <Text style={styles.cPrice}>Precio</Text>
        <Text style={styles.cDisc}>Desc.</Text>
        <Text style={styles.cTotal}>Total</Text>
      </View>
      {items.map((item) => (
        <View key={item.id} style={styles.row} wrap={false}>
          <Text style={styles.cQty}>
            {formatQty(item.quantity, item.unitDecimals)} {item.unitSymbol}
          </Text>
          <View style={styles.cDesc}>
            <Text>{item.description}</Text>
            {item.partNumber ? <Text style={styles.muted}>N.º de parte {item.partNumber}</Text> : null}
          </View>
          <Text style={styles.cPrice}>{formatMoney(item.unitPriceUsd, "USD")}</Text>
          <Text style={styles.cDisc}>{item.discountUsd && D(item.discountUsd).gt(0) ? `-${formatMoney(item.discountUsd, "USD")}` : ""}</Text>
          <Text style={styles.cTotal}>{formatMoney(item.lineTotalUsd, "USD")}</Text>
        </View>
      ))}
    </View>
  );
}

function Totals({ subtotal, discount, tax, total, rateVes, rateCop, showCop }: { subtotal: string; discount: string; tax: string; total: string; rateVes: string; rateCop: string; showCop: boolean }) {
  const ves = D(rateVes);
  const cop = D(rateCop);
  return (
    <View style={styles.totals}>
      <View style={styles.totalRow}>
        <Text>Subtotal</Text>
        <Text>{formatMoney(subtotal, "USD")}</Text>
      </View>
      {D(discount).gt(0) ? (
        <View style={styles.totalRow}>
          <Text>Descuento</Text>
          <Text>-{formatMoney(discount, "USD")}</Text>
        </View>
      ) : null}
      <View style={styles.totalRow}>
        <Text>IVA incluido</Text>
        <Text>{formatMoney(tax, "USD")}</Text>
      </View>
      <View style={[styles.totalRow, styles.totalBold]}>
        <Text>TOTAL</Text>
        <Text>{formatMoney(total, "USD")}</Text>
      </View>
      {ves.gt(0) ? (
        <View style={styles.totalRow}>
          <Text>Total en bolívares (1 $ = {formatMoney(ves, "VES")})</Text>
          <Text>{formatMoney(D(total).mul(ves), "VES")}</Text>
        </View>
      ) : null}
      {showCop && cop.gt(0) ? (
        <View style={styles.totalRow}>
          <Text>Total en pesos (1 $ = {formatMoney(cop, "COP")})</Text>
          <Text>{formatMoney(D(total).mul(cop), "COP")}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function SaleDocument({ sale, company, printing }: { sale: SaleDetail; company: CompanySettings; printing: PrintingSettings }) {
  return (
    <Document title={`Nota de entrega ${sale.number ?? ""}`} author={company.name}>
      <Page size="A4" style={styles.page}>
        <Header company={company} title={sale.status === "voided" ? "NOTA DE ENTREGA (ANULADA)" : "NOTA DE ENTREGA"} number={sale.number} />
        <View style={styles.block}>
          <View>
            <Text style={styles.label}>Cliente</Text>
            <Text>{sale.customer ? sale.customer.name : "Consumidor final"}</Text>
            {sale.customer && sale.customer.docType !== "NONE" && sale.customer.docNumber ? (
              <Text>
                {sale.customer.docType}-{sale.customer.docNumber}
              </Text>
            ) : null}
            {sale.customer?.phone ? <Text>{sale.customer.phone}</Text> : null}
          </View>
          <View style={{ textAlign: "right" }}>
            <Text style={styles.label}>Fecha</Text>
            <Text>{formatDateTime(sale.saleDate)}</Text>
            <Text style={styles.label}>Vendedor</Text>
            <Text>{sale.seller.name}</Text>
          </View>
        </View>
        <LinesTable items={sale.items} />
        <Totals subtotal={sale.subtotalUsd} discount={sale.discountUsd} tax={sale.taxUsd} total={sale.totalUsd} rateVes={sale.rateVes} rateCop={sale.rateCop} showCop={printing.showCopOnTicket} />
        {sale.payments.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Pagos</Text>
            {sale.payments.map((p) => (
              <View key={p.id} style={styles.totalRow}>
                <Text>
                  {p.methodName}
                  {p.reference ? ` (ref. ${p.reference})` : ""}
                </Text>
                <Text>
                  {formatMoney(p.amount, p.currencyCode)}
                  {p.currencyCode !== "USD" ? ` = ${formatMoney(p.amountUsd, "USD")}` : ""}
                </Text>
              </View>
            ))}
            {D(sale.changeUsd).gt(0) && sale.changeCurrencyCode ? (
              <View style={styles.totalRow}>
                <Text>Cambio entregado</Text>
                <Text>{formatMoney(sale.changeAmount, sale.changeCurrencyCode)}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
        {sale.notes ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notas</Text>
            <Text>{sale.notes}</Text>
          </View>
        ) : null}
        <Text style={styles.footer}>
          {printing.footer} · Este documento no es una factura fiscal.
        </Text>
      </Page>
    </Document>
  );
}

export function QuoteDocument({ quote, company, printing }: { quote: QuoteDetail; company: CompanySettings; printing: PrintingSettings }) {
  return (
    <Document title={`Cotización ${quote.number ?? ""}`} author={company.name}>
      <Page size="A4" style={styles.page}>
        <Header company={company} title="COTIZACIÓN" number={quote.number} />
        <View style={styles.block}>
          <View>
            <Text style={styles.label}>Cliente</Text>
            <Text>{quote.customer ? quote.customer.name : "Consumidor final"}</Text>
            {quote.customer && quote.customer.docType !== "NONE" && quote.customer.docNumber ? (
              <Text>
                {quote.customer.docType}-{quote.customer.docNumber}
              </Text>
            ) : null}
            {quote.customer?.phone ? <Text>{quote.customer.phone}</Text> : null}
          </View>
          <View style={{ textAlign: "right" }}>
            <Text style={styles.label}>Fecha</Text>
            <Text>{formatDateTime(quote.createdAt)}</Text>
            <Text style={styles.label}>Válida hasta</Text>
            <Text>{formatDateOnly(quote.validUntil)}</Text>
            <Text style={styles.label}>Vendedor</Text>
            <Text>{quote.seller.name}</Text>
          </View>
        </View>
        <LinesTable items={quote.items.map((i) => ({ ...i, discountUsd: undefined }))} />
        <Totals subtotal={quote.subtotalUsd} discount={quote.discountUsd} tax={quote.taxUsd} total={quote.totalUsd} rateVes={quote.rateVes} rateCop={quote.rateCop} showCop={printing.showCopOnTicket} />
        {quote.notes ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Condiciones</Text>
            <Text>{quote.notes}</Text>
          </View>
        ) : null}
        <Text style={styles.footer}>Precios en dólares con IVA incluido; el equivalente en bolívares es a la tasa del día de la cotización. {company.name}</Text>
      </Page>
    </Document>
  );
}

export function renderSalePdf(sale: SaleDetail, company: CompanySettings, printing: PrintingSettings): Promise<Buffer> {
  return renderToBuffer(<SaleDocument sale={sale} company={company} printing={printing} />);
}

export function renderQuotePdf(quote: QuoteDetail, company: CompanySettings, printing: PrintingSettings): Promise<Buffer> {
  return renderToBuffer(<QuoteDocument quote={quote} company={company} printing={printing} />);
}
