/** Printable pages: no sidebar, no header, white background. */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-svh bg-white text-black">{children}</div>;
}
