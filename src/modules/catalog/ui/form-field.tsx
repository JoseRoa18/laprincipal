import { Label } from "@/components/ui/label";
import { cn } from "cn";

/** Label + control + hint + error, in the layout used by every catalog form. */
export function FormField({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)} data-invalid={error ? "true" : undefined}>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      {children}
      {hint && !error ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Touch-friendly control height shared by the catalog forms. */
export const controlClass = "h-11 text-base md:h-10 md:text-sm";
export const selectWrapperClass = "w-full [&_select]:h-11 [&_select]:text-base md:[&_select]:h-10 md:[&_select]:text-sm";
