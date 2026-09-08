"use client";

import { ShieldCheck } from "lucide-react";
import { useState, useTransition } from "react";
import { authorizeDiscountAction } from "@/app/(app)/vender/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SupervisorAuth } from "../cart-store";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reason: string;
  onAuthorized: (auth: SupervisorAuth) => void;
}

/** Asks an administrator's PIN and returns a short-lived authorization token. */
export function SupervisorDialog({ open, onOpenChange, reason, onAuthorized }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <SupervisorForm
          reason={reason}
          onAuthorized={(auth) => {
            onAuthorized(auth);
            onOpenChange(false);
          }}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function SupervisorForm({ reason, onAuthorized, onCancel }: { reason: string; onAuthorized: (auth: SupervisorAuth) => void; onCancel: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!/^\d{4,6}$/.test(pin)) {
      setError("Escribe el PIN de 4 a 6 dígitos.");
      return;
    }
    startTransition(async () => {
      const result = await authorizeDiscountAction(pin);
      if (!result.ok) {
        setError(result.error.message);
        setPin("");
        return;
      }
      onAuthorized({ token: result.data.token, expiresAt: result.data.expiresAt, name: result.data.adminName });
    });
  }

  return (
    <div
      className="contents"
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          submit();
        }
      }}
    >
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <ShieldCheck className="size-5" /> Autorización de supervisor
        </DialogTitle>
        <DialogDescription>{reason}</DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor="supervisor-pin">PIN del administrador</Label>
        <Input
          id="supervisor-pin"
          type="password"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          autoFocus
          className="h-12 text-center text-2xl tracking-[0.5em]"
        />
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          Cancelar
        </Button>
        <Button type="button" onClick={submit} disabled={pending || pin.length < 4}>
          {pending ? "Verificando..." : "Autorizar"}
        </Button>
      </DialogFooter>
    </div>
  );
}
