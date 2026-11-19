// ============================================================================
// Tela de login do painel: /admin/login.
//
// Quem chega aqui: o dono, ao abrir /admin sem sessão (todas as páginas do painel redirecionam para
// cá). Esta página é só a moldura (título + formulário); a lógica de entrar fica na ação loginAction
// (src/app/admin/actions.ts) e o formulário em LoginForm.tsx.
// ============================================================================

import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    // Centralizada na altura da tela: é a única coisa visível antes do login.
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col justify-center gap-10 px-6 py-16">
      <h1 className="font-display text-[clamp(3.5rem,10vw,9rem)] uppercase leading-[0.9]">
        Painel
      </h1>
      <LoginForm />
    </main>
  );
}
