// ============================================================================
// Prazos que o pedido segura as peças no estoque.
//
// Um pedido PENDENTE reserva as peças. Se ninguém paga, elas precisam voltar à venda:
//   - pedido com cobrança ONLINE (Mercado Pago): poucas horas. O cliente está com a página de pagamento aberta,
//     e o Pix/cartão se resolvem rápido. Reservar por dias seguraria a peça por um Pix que nunca será pago;
//   - pedido combinado pelo WHATSAPP: 48 horas (padrão; o dono pode mudar com PENDING_ORDER_HOURS), porque
//     depende de uma pessoa confirmar o pagamento.
// Fica em src/lib porque a tela de retorno do pagamento também mostra o prazo ao cliente.
// ============================================================================

/** Horas que um pedido com cobrança online segura as peças, e prazo de validade da própria cobrança. */
export const PRAZO_ONLINE_HORAS = 12;

/** Horas que um pedido combinado só pelo WhatsApp segura as peças (padrão). */
export const PRAZO_WHATSAPP_HORAS = 48;
