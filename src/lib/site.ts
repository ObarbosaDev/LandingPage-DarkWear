// ============================================================================
// Dados gerais da marca, num lugar só.
//
// Quem usa: o cabeçalho de todas as páginas (título e descrição), o rodapé, as mensagens do
// WhatsApp, a conferência de configuração (src/server/env.ts) e vários textos do site.
// Para mudar o nome, a descrição ou o número do WhatsApp da loja, é só editar aqui.
// ============================================================================

// Dados gerais da marca. Ajuste aqui, em um lugar só.

export const SITE = {
  name: "DarkWear",
  tagline: "Camisetas DTF.",
  // Texto que aparece nos resultados de busca (Google) e ao compartilhar o link.
  description:
    "Blusas DTF prontas para vestir ou feitas sob encomenda com a sua arte.",
  // TODO: trocar pelo número real do WhatsApp da loja, no formato 55 + DDD + número.
  // ATENÇÃO: enquanto for este número de exemplo, o site NÃO sobe na produção da Vercel (de propósito,
  // para não receber pedidos num número que não existe). Ver src/server/env.ts.
  whatsappNumber: "5500000000000",
  // Pix e cartão são combinados no WhatsApp até o gateway ser integrado.
  paymentNote: "Pagamento via Pix ou cartão, combinado no WhatsApp.",
} as const;
