// Dados gerais da marca. Ajuste aqui, em um lugar só.

export const SITE = {
  name: "DarkWear",
  tagline: "Camisetas DTF.",
  description:
    "Blusas DTF prontas para vestir ou feitas sob encomenda com a sua arte.",
  // TODO: trocar pelo número real do WhatsApp da loja, no formato 55 + DDD + número.
  whatsappNumber: "5500000000000",
  // Pix e cartão são combinados no WhatsApp até o gateway ser integrado.
  paymentNote: "Pagamento via Pix ou cartão, combinado no WhatsApp.",
} as const;

export function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
