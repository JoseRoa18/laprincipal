"use client";

import { Hash, KeyRound, MoreHorizontal, Pencil, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import type { UserListRow } from "@/modules/auth/infrastructure/users";
import { ROLE_LABEL } from "@/modules/auth/ui/roles";
import { CreateUserDialog, EditUserDialog, ResetPasswordDialog, ResetPinDialog } from "@/modules/auth/ui/user-dialogs";

type DialogKind = "create" | "edit" | "password" | "pin";

export function UsersTable({
  users,
  currentUserId,
}: {
  users: UserListRow[];
  /** Signed-in admin: highlighted as "Tú" and protected from deactivating themselves. */
  currentUserId: string;
}) {
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  // Keeps the last selected user while a dialog closes, so its content does not flash empty.
  const [selected, setSelected] = useState<UserListRow | null>(null);

  function openFor(kind: Exclude<DialogKind, "create">, user: UserListRow) {
    setSelected(user);
    setDialog(kind);
  }

  function handleOpenChange(open: boolean) {
    if (!open) setDialog(null);
  }

  const activeCount = users.filter((u) => u.isActive).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {users.length} {users.length === 1 ? "usuario" : "usuarios"} · {activeCount} {activeCount === 1 ? "activo" : "activos"}
        </p>
        <Button size="lg" onClick={() => setDialog("create")}>
          <UserPlus />
          Nuevo usuario
        </Button>
      </div>

      {users.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Todavía no hay usuarios"
          description="Crea una cuenta para cada persona que use la app y asígnale su rol."
          action={<Button onClick={() => setDialog("create")}>Nuevo usuario</Button>}
        />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead className="hidden md:table-cell">Correo</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>PIN</TableHead>
                <TableHead className="hidden md:table-cell">Último acceso</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Acciones</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => {
                const isSelf = u.id === currentUserId;
                return (
                  <TableRow key={u.id} className={isSelf ? "bg-muted/30" : undefined}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{u.name}</span>
                        {isSelf ? <Badge variant="secondary">Tú</Badge> : null}
                      </div>
                      <p className="text-muted-foreground text-xs md:hidden">{u.email}</p>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{u.email}</TableCell>
                    <TableCell>{ROLE_LABEL[u.role]}</TableCell>
                    <TableCell>
                      <Badge variant={u.isActive ? "outline" : "secondary"}>{u.isActive ? "Activo" : "Inactivo"}</Badge>
                    </TableCell>
                    <TableCell>{u.hasPin ? "Sí" : <span className="text-muted-foreground">No</span>}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : <span className="text-muted-foreground">Nunca</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={`Acciones de ${u.name}`} />}>
                          <MoreHorizontal />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuItem onClick={() => openFor("edit", u)}>
                            <Pencil />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openFor("password", u)}>
                            <KeyRound />
                            Cambiar contraseña
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openFor("pin", u)}>
                            <Hash />
                            {u.hasPin ? "Cambiar PIN" : "Asignar PIN"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <CreateUserDialog open={dialog === "create"} onOpenChange={handleOpenChange} />
      {selected ? (
        <>
          <EditUserDialog user={selected} isSelf={selected.id === currentUserId} open={dialog === "edit"} onOpenChange={handleOpenChange} />
          <ResetPasswordDialog user={selected} open={dialog === "password"} onOpenChange={handleOpenChange} />
          <ResetPinDialog user={selected} open={dialog === "pin"} onOpenChange={handleOpenChange} />
        </>
      ) : null}
    </div>
  );
}
