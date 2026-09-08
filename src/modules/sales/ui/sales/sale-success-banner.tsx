"use client";

import { CircleCheck, Printer, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { shareSaleWhatsAppAction } from "@/app/(app)/ventas/actions";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import { D } from "@/lib/money";
import { ShareWhatsAppButton } from "./sale-actions";

interface Props {
  saleId: string;
  number: string | null;
  totalUsd: string;
  changeUsd: string;
  changeCurrencyCode: string | null;
  changeAmount: string;
  /** Print the ticket automatically through a hidden frame. */
  autoPrint: boolean;
  wantsWhatsapp: boolean;
}

/** Shown right after a sale: what to hand over and what to do next. */
export function SaleSuccessBanner({ saleId, number, totalUsd, changeUsd, changeCurrencyCode, changeAmount, autoPrint, wantsWhatsapp }: Props) {
  const hasChange = D(changeUsd).gt(0) && changeCurrencyCode;
  return (
    <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-50">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <CircleCheck className="size-8 shrink-0 text-emerald-600" />
          <div>
            <p className="text-lg font-semibold">Venta {number} registrada</p>
            <p className="text-sm">
              Total {formatMoney(totalUsd, "USD")}
              {hasChange ? (
                <>
                  {" · "}
                  <span className="font-semibold">Cambio: {formatMoney(changeAmount, changeCurrencyCode!)}</span>
                  {changeCurrencyCode !== "USD" ? ` (${formatMoney(changeUsd, "USD")})` : ""}
                </>
              ) : null}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="lg" render={<a href={`/imprimir/ticket/${saleId}?auto=1`} target="_blank" rel="noopener" />}>
            <Printer /> Imprimir ticket
          </Button>
          {wantsWhatsapp ? <ShareWhatsAppButton action={() => shareSaleWhatsAppAction(saleId)} label="Enviar por WhatsApp" size="lg" /> : null}
          <Button size="lg" render={<Link href="/vender" />}>
            <ShoppingCart /> Nueva venta
          </Button>
        </div>
      </div>
      {autoPrint ? (
        <iframe
          src={`/imprimir/ticket/${saleId}?auto=1`}
          title="Ticket"
          aria-hidden="true"
          tabIndex={-1}
          className="absolute h-0 w-0 border-0 opacity-0"
        />
      ) : null}
    </div>
  );
}
