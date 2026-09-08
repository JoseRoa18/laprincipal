import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function BackToReports() {
  return (
    <Button variant="ghost" size="sm" render={<Link href="/reportes" />}>
      <ChevronLeft data-icon="inline-start" />
      Todos los reportes
    </Button>
  );
}
