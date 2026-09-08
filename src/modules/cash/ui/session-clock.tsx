"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  const timer = setInterval(onChange, 60_000);
  return () => clearInterval(timer);
}

const currentMinute = () => Math.floor(Date.now() / 60_000);
const serverSnapshot = () => null;

/** "3 h 12 min" since `since` (ISO string), refreshed every minute. Renders a placeholder on the server. */
export function SessionClock({ since }: { since: string }) {
  const minute = useSyncExternalStore(subscribe, currentMinute, serverSnapshot);
  if (minute === null) return <span aria-hidden="true">…</span>;
  const minutes = Math.max(0, minute - Math.floor(new Date(since).getTime() / 60_000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return <span className="tabular-nums">{hours > 0 ? `${hours} h ${rest} min` : `${minutes} min`}</span>;
}
