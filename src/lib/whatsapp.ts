import { SITE } from "@/lib/site";
import { formatCents } from "@/lib/money";

export function whatsappLink(message: string) {
  return `https://wa.me/${SITE.whatsappNumber}?text=${encodeURIComponent(message)}`;
}

export type OrderLine = {
  name: string;
  size: string;
  color: string;
  qty: number;
  priceCents: number;
};

export function buildCartMessage(lines: OrderLine[]) {
  const itens = lines
    .map(
      (l) =>
        `• ${l.qty}x ${l.name} (${l.color}, tam. ${l.size}) — ${formatCents(l.priceCents * l.qty)}`,
    )
    .join("\n");
  const total = lines.reduce((s, l) => s + l.priceCents * l.qty, 0);
  return [
    `Olá! Quero fechar este pedido na ${SITE.name}:`,
    "",
    itens,
    "",
    `Total: ${formatCents(total)}`,
    "",
    SITE.paymentNote,
  ].join("\n");
}

export type CustomOrder = {
  name: string;
  model: string;
  color: string;
  size: string;
  placement: string;
  notes?: string;
  fileName?: string;
};

const PLACEMENT_LABEL: Record<string, string> = {
  peito: "Peito esquerdo",
  frente: "Frente centro",
  costas: "Costas",
  manga: "Manga",
};

export function buildCustomMessage(o: CustomOrder) {
  return [
    `Olá! Quero uma blusa personalizada na ${SITE.name}:`,
    "",
    `• Nome: ${o.name || "—"}`,
    `• Modelo: ${o.model}`,
    `• Cor: ${o.color}`,
    `• Tamanho: ${o.size}`,
    `• Posição da arte: ${PLACEMENT_LABEL[o.placement] ?? o.placement}`,
    o.notes ? `• Detalhes: ${o.notes}` : null,
    "",
    o.fileName
      ? `Vou enviar a arte (${o.fileName}) logo em seguida nesta conversa.`
      : "Vou enviar a arte nesta conversa.",
    "",
    "Pode me passar o orçamento e o prazo de produção?",
  ]
    .filter((l) => l !== null)
    .join("\n");
}
