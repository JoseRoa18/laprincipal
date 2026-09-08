import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-80 w-full" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-60 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    </div>
  );
}
