import type { Metadata } from "next";

// O painel nunca deve aparecer em buscadores.
export const metadata: Metadata = {
  title: { default: "Painel", template: "%s · Painel DarkWear" },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background text-foreground">{children}</div>;
}
