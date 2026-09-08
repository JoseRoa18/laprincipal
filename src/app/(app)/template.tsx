/**
 * Re-mounts on every navigation, so each screen enters with a short fade and rise.
 * Motion is disabled globally for users who prefer reduced motion (see globals.css).
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-in fade-in-0 slide-in-from-bottom-1 duration-300 ease-out">{children}</div>;
}
