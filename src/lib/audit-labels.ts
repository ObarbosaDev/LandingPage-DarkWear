// ============================================================================
// Frases do DIÁRIO do painel: transforma o código de cada ação ("pedido.status") em texto para o dono ler.
// Fica em src/lib porque é só texto (sem banco), e a tela e os testes usam o mesmo.
// ============================================================================

const FRASES: Record<string, string> = {
  "pedido.status": "mudou o pedido",
  "pedido.rastreio": "mexeu no rastreio do pedido",
  "produto.criar": "cadastrou a peça",
  "produto.editar": "editou a peça",
  "produto.estoque": "ajustou o estoque de",
  "produto.visibilidade": "mudou a visibilidade de",
  "encomenda.status": "mudou o andamento da",
  "cupom.criar": "criou o cupom",
  "cupom.visibilidade": "mudou o cupom",
  "cliente.senha-provisoria": "gerou senha provisória para o",
};

/** A frase de uma ação. Código que ainda não conhecemos aparece como está, em vez de sumir ou quebrar a tela. */
export function fraseDaAcao(acao: string): string {
  return FRASES[acao] ?? acao;
}

/** Só a parte do e-mail antes do "@": o diário mostra "ana.admin", não o endereço inteiro, para caber na linha. */
export function nomeCurtoDoAtor(email: string): string {
  const i = email.indexOf("@");
  return i > 0 ? email.slice(0, i) : email;
}
