"use client";

import type { InputHTMLAttributes } from "react";
import { cn } from "cn";
import type { OwnerOption } from "../infrastructure/catalog-options";

/**
 * Whose merchandise it is: one big button per owner (there are only a few).
 * Native radios underneath, so the keyboard and react-hook-form work as usual:
 * pass `inputProps` from register(), or `value` + `onChange` to control it.
 */
export function OwnerPicker({
  owners,
  name,
  value,
  onChange,
  inputProps,
  invalid = false,
  disabled = false,
  describedBy,
}: {
  owners: OwnerOption[];
  name: string;
  value?: string;
  onChange?: (ownerId: string) => void;
  inputProps?: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value">;
  invalid?: boolean;
  disabled?: boolean;
  describedBy?: string;
}) {
  if (owners.length === 0) return <p className="text-destructive text-sm">No hay dueños registrados.</p>;
  return (
    <div role="radiogroup" aria-label="Dueño de la mercancía" aria-invalid={invalid || undefined} aria-describedby={describedBy} className="flex flex-wrap gap-2">
      {owners.map((owner) => (
        <label
          key={owner.id}
          className={cn(
            "flex h-11 min-w-28 cursor-pointer items-center justify-center rounded-lg border px-4 text-sm font-medium transition-colors md:h-10",
            "hover:bg-muted has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground",
            "has-[:focus-visible]:ring-ring/50 has-[:focus-visible]:ring-3 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50",
            invalid && "border-destructive",
          )}
        >
          <input
            type="radio"
            name={name}
            value={owner.id}
            disabled={disabled}
            className="sr-only"
            {...(inputProps ?? { checked: value === owner.id, onChange: () => onChange?.(owner.id) })}
          />
          {owner.name}
        </label>
      ))}
    </div>
  );
}
