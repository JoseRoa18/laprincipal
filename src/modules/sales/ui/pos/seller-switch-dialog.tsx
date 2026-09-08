"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { clearActingSellerAction, switchSellerAction } from "@/app/(app)/vender/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { PosConfig } from "./types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: PosConfig;
}

/** "Cambiar vendedor": pick a user and type their PIN; the device keeps its session. */
export function SellerSwitchDialog({ open, onOpenChange, config }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-sm">
        <SellerSwitchForm config={config} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function SellerSwitchForm({ config, onDone }: { config: PosConfig; onDone: () => void }) {
  const router = useRouter();
  const candidates = config.pinUsers.filter((u) => u.role !== "warehouse");
  const [userId, setUserId] = useState(() => candidates.find((u) => u.id !== config.seller.id)?.id ?? candidates[0]?.id ?? "");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!userId) {
      setError("Elige un vendedor.");
      return;
    }
    if (!/^\d{4,6}$/.test(pin)) {
      setError("Escribe el PIN de 4 a 6 dígitos.");
      return;
    }
    startTransition(async () => {
      const result = await switchSellerAction({ userId, pin });
      if (!result.ok) {
        setError(result.error.message);
        setPin("");
        return;
      }
      toast.success(`Ahora vende ${result.data.name}`);
      onDone();
      router.refresh();
    });
  }

  function restore() {
    startTransition(async () => {
      const result = await clearActingSellerAction();
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(`Vuelves a vender como ${config.user.name}`);
      onDone();
      router.refresh();
    });
  }

  return (
    <div
      className="contents"
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
          e.preventDefault();
          submit();
        }
      }}
    >
      <DialogHeader>
        <DialogTitle>Cambiar vendedor</DialogTitle>
        <DialogDescription>Las ventas quedarán a nombre del vendedor elegido hasta que cambie de nuevo (máximo 12 horas).</DialogDescription>
      </DialogHeader>
      {candidates.length === 0 ? (
        <p className="text-muted-foreground text-sm">Ningún usuario tiene PIN configurado. Se configura en Configuración → Usuarios.</p>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="seller-user">Vendedor</Label>
            <NativeSelect className="w-full" id="seller-user" value={userId} onChange={(e) => setUserId(e.target.value)}>
              {candidates.map((u) => (
                <NativeSelectOption key={u.id} value={u.id}>
                  {u.name}
                  {u.id === config.user.id ? " (sesión actual)" : ""}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="seller-pin">PIN</Label>
            <Input
              id="seller-pin"
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              className="h-12 text-center text-2xl tracking-[0.5em]"
            />
          </div>
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
        </div>
      )}
      <DialogFooter>
        {config.seller.isActing ? (
          <Button type="button" variant="ghost" className="sm:mr-auto" onClick={restore} disabled={pending}>
            Volver a {config.user.name.split(" ")[0]}
          </Button>
        ) : null}
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          Cancelar
        </Button>
        <Button type="button" onClick={submit} disabled={pending || candidates.length === 0}>
          {pending ? "Verificando..." : "Cambiar"}
        </Button>
      </DialogFooter>
    </div>
  );
}
