import { Suspense } from "react";
import { requireAdmin } from "@/lib/admin-auth";
import { AdminNav } from "./AdminNav";

// Área privada: não precisa de casca estática instantânea. Ela bloqueia no servidor até validar a sessão.
export const instant = false;

// Tudo dentro de (painel) exige sessão. A leitura do cookie é dinâmica, então fica dentro de Suspense
// (exigência do Cache Components). Cada página e cada ação repetem a verificação por segurança.
export default function PainelLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<p className="p-6 text-xl font-medium">Carregando painel…</p>}>
      <Gate>{children}</Gate>
    </Suspense>
  );
}

async function Gate({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <>
      <AdminNav />
      <main className="mx-auto max-w-7xl px-6 py-12">{children}</main>
    </>
  );
}
