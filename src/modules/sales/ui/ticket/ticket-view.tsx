import { formatDateTime, formatMoney, formatQty } from "@/lib/format";
import { D } from "@/lib/money";
import type { CompanySettings, PrintingSettings } from "@/modules/settings/infrastructure/settings";
import type { SaleDetail } from "../../infrastructure/sales-queries";

interface Props {
  sale: SaleDetail;
  company: CompanySettings;
  printing: PrintingSettings;
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 ${bold ? "font-bold" : ""}`}>
      <span className="min-w-0 truncate">{label}</span>
      <span className="shrink-0 tabular-nums">{value}</span>
    </div>
  );
}

const Divider = () => <div className="my-1 border-t border-dashed border-black" />;

/**
 * 58/80 mm receipt ("Nota de entrega", not a fiscal invoice). Pure server
 * markup: the page adds the @page CSS and the print controls.
 */
export function TicketView({ sale, company, printing }: Props) {
  const width = printing.ticketWidthMm;
  const rateVes = D(sale.rateVes);
  const rateCop = D(sale.rateCop);
  const totalBs = rateVes.gt(0) ? D(sale.totalUsd).mul(rateVes) : null;
  const totalCop = rateCop.gt(0) ? D(sale.totalUsd).mul(rateCop) : null;
  const size = width === 58 ? "text-[10px]" : "text-[11px]";

  return (
    <div className={`mx-auto bg-white px-1 py-2 font-mono leading-tight text-black ${size}`} style={{ width: `${width}mm` }}>
      <div className="text-center">
        <p className="text-sm font-bold uppercase">{company.name}</p>
        {company.taxId ? <p>RIF {company.taxId}</p> : null}
        {company.address ? <p>{company.address}</p> : null}
        {company.phone ? <p>Tel. {company.phone}</p> : null}
      </div>
      <Divider />
      <Row label="NOTA DE ENTREGA" value={sale.number ?? ""} bold />
      <p>{formatDateTime(sale.saleDate)}</p>
      <p>Vendedor: {sale.seller.name}</p>
      <p>
        Cliente: {sale.customer ? sale.customer.name : "Consumidor final"}
        {sale.customer && sale.customer.docType !== "NONE" && sale.customer.docNumber ? ` (${sale.customer.docType}-${sale.customer.docNumber})` : ""}
      </p>
      {sale.status === "voided" ? <p className="mt-1 text-center font-bold">*** ANULADA ***</p> : null}
      <Divider />
      {sale.items.map((item) => (
        <div key={item.id} className="mb-1">
          <p className="break-words">{item.description}</p>
          <Row
            label={`${formatQty(item.quantity, item.unitDecimals)} ${item.unitSymbol} x ${formatMoney(item.unitPriceUsd, "USD")}`}
            value={formatMoney(item.lineTotalUsd, "USD")}
          />
          {D(item.discountUsd).gt(0) ? <p className="pl-2">Desc. -{formatMoney(item.discountUsd, "USD")}</p> : null}
        </div>
      ))}
      <Divider />
      <Row label="Subtotal" value={formatMoney(sale.subtotalUsd, "USD")} />
      {D(sale.discountUsd).gt(0) ? <Row label="Descuento" value={`-${formatMoney(sale.discountUsd, "USD")}`} /> : null}
      <Row label="IVA incluido" value={formatMoney(sale.taxUsd, "USD")} />
      <Row label="TOTAL" value={formatMoney(sale.totalUsd, "USD")} bold />
      {printing.showBsOnTicket && totalBs ? <Row label="Total Bs" value={formatMoney(totalBs, "VES")} bold /> : null}
      {printing.showCopOnTicket && totalCop ? <Row label="Total COP" value={formatMoney(totalCop, "COP")} /> : null}
      {rateVes.gt(0) ? <p>Tasa: 1 $ = {formatMoney(rateVes, "VES")}</p> : null}
      {printing.showCopOnTicket && rateCop.gt(0) ? <p>Tasa: 1 $ = {formatMoney(rateCop, "COP")}</p> : null}
      <Divider />
      {sale.payments.length > 0 ? (
        <>
          <p className="font-bold">Pagos</p>
          {sale.payments.map((p) => (
            <Row key={p.id} label={`${p.methodName}${p.reference ? ` ref ${p.reference}` : ""}`} value={formatMoney(p.amount, p.currencyCode)} />
          ))}
        </>
      ) : null}
      {D(sale.changeUsd).gt(0) && sale.changeCurrencyCode ? (
        <Row label={`Cambio (${sale.changeCurrencyCode === "USD" ? "efectivo $" : "efectivo " + sale.changeCurrencyCode})`} value={formatMoney(sale.changeAmount, sale.changeCurrencyCode)} bold />
      ) : null}
      {sale.notes ? (
        <>
          <Divider />
          <p className="break-words">{sale.notes}</p>
        </>
      ) : null}
      <Divider />
      <p className="text-center">{printing.footer}</p>
      <p className="mt-1 text-center">Este comprobante no es una factura fiscal.</p>
    </div>
  );
}
