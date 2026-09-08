"use client";

import { FileText, ShoppingCart, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cancelQuoteAction, shareQuoteWhatsAppAction } from "@/app/(app)/cotizaciones/actions";
import { ConfirmButton } from "@/components/app/confirm-button";
import { Button } from "@/components/ui/button";
import { ShareWhatsAppButton } from "../sales/sale-actions";

interface Props {
  quoteId: string;
  number: string | null;
  isOpen: boolean;
  convertedSale: { id: string; number: string | null } | null;
}

export function QuoteActions({ quoteId, number, isOpen, convertedSale }: Props) {
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {isOpen ? (
        <Button size="lg" render={<Link href={`/vender?cotizacion=${quoteId}`} />}>
          <ShoppingCart /> Convertir en venta
        </Button>
      ) : null}
      {convertedSale ? (
        <Button variant="outline" render={<Link href={`/ventas/${convertedSale.id}`} />}>
          Ver venta {convertedSale.number}
        </Button>
      ) : null}
      <Button variant="outline" render={<a href={`/api/sales/quotes/${quoteId}/pdf`} target="_blank" rel="noopener" />}>
        <FileText /> PDF
      </Button>
      <ShareWhatsAppButton action={() => shareQuoteWhatsAppAction(quoteId)} />
      {isOpen ? (
        <ConfirmButton
          title={`¿Cancelar la cotización ${number ?? ""}?`}
          description="Si reservaba stock, las cantidades quedan disponibles de nuevo."
          confirmLabel="Cancelar cotización"
          cancelLabel="Volver"
          destructive
          variant="outline"
          action={() => cancelQuoteAction(quoteId)}
          successMessage="Cotización cancelada"
          onSuccess={() => router.refresh()}
        >
          <XCircle /> Cancelar
        </ConfirmButton>
      ) : null}
    </div>
  );
}
