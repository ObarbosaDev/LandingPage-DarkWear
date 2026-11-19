"use client";

import { ErrorView } from "@/components/ErrorView";

export default function AdminError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorView {...props} saida={{ href: "/admin", rotulo: "Voltar ao painel" }} />;
}
