import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col justify-center gap-10 px-6 py-16">
      <h1 className="font-display text-[clamp(3.5rem,10vw,9rem)] uppercase leading-[0.9]">
        Painel
      </h1>
      <LoginForm />
    </main>
  );
}
