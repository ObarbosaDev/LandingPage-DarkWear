// ============================================================================
// Montagem das mensagens e links do WhatsApp.
//
// Por que existe: a loja fecha as vendas pelo WhatsApp (Pix e cartão são combinados na conversa).
// Aqui são montados o link "wa.me" e o texto pronto da mensagem, para o cliente só tocar em enviar.
//
// Quem usa: as rotas de API (/api/orders e /api/custom-orders, que devolvem o link ao navegador) e
// as páginas /faq e /contato (botões "Chamar no WhatsApp").
// ============================================================================

import { SITE } from "@/lib/site";
import { formatCents } from "@/lib/money";

/**
 * Link que abre uma conversa com a loja com a mensagem já escrita.
 * encodeURIComponent troca acentos, espaços e quebras de linha por códigos próprios de link;
 * sem isso, a mensagem chegaria quebrada ou cortada.
 */
export function whatsappLink(message: string) {
  return `https://wa.me/${SITE.whatsappNumber}?text=${encodeURIComponent(message)}`;
}

/** Uma linha de pedido, como entra na mensagem. */
export type OrderLine = {
  name: string;
  size: string;
  color: string;
  qty: number;
  priceCents: number;
};

/**
 * Texto do pedido de peças prontas: lista cada item com o valor da linha, o total e a nota de pagamento.
 * Usado por POST /api/orders, que o envia depois de registrar o pedido (por isso os valores aqui já são
 * os do servidor, e não os do navegador).
 */
export function buildCartMessage(lines: OrderLine[]) {
  // Uma linha por item: "• 2x Oversized GT3 RS (Preta, tam. M) — R$ 179,80".
  const itens = lines
    .map(
      (l) =>
        `• ${l.qty}x ${l.name} (${l.color}, tam. ${l.size}) — ${formatCents(l.priceCents * l.qty)}`,
    )
    .join("\n");
  const total = lines.reduce((s, l) => s + l.priceCents * l.qty, 0);
  // As strings vazias ("") viram linhas em branco entre os blocos da mensagem.
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

/** Os dados da encomenda personalizada, como entram na mensagem. */
export type CustomOrder = {
  name: string;
  model: string;
  color: string;
  size: string;
  placement: string;
  notes?: string;
  fileName?: string;
};

// Nome legível de cada posição da arte (o banco guarda só o código curto: peito, frente...).
const PLACEMENT_LABEL: Record<string, string> = {
  peito: "Peito esquerdo",
  frente: "Frente centro",
  costas: "Costas",
  manga: "Manga",
};

/**
 * Texto da encomenda personalizada: resume o que o cliente escolheu em /personalizar e pede o orçamento.
 * Usado por POST /api/custom-orders. O arquivo da arte não vai junto (o site não o recebe): a
 * mensagem avisa que o cliente o anexa na própria conversa.
 */
export function buildCustomMessage(o: CustomOrder) {
  return [
    `Olá! Quero uma blusa personalizada na ${SITE.name}:`,
    "",
    `• Nome: ${o.name || "—"}`,
    `• Modelo: ${o.model}`,
    `• Cor: ${o.color}`,
    `• Tamanho: ${o.size}`,
    `• Posição da arte: ${PLACEMENT_LABEL[o.placement] ?? o.placement}`,
    // "Detalhes" é opcional: sem observações, vira null e é removido pelo filter logo abaixo.
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
