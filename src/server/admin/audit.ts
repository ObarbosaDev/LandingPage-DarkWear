// ============================================================================
// DIÁRIO DO PAINEL: quem (qual administrador) fez o quê, e quando.
//
// Quem usa: as ações do painel (src/app/admin/actions.ts) chamam auditar() depois de cada mudança que deu certo,
// e a tela /admin/diario lê com listarAuditoria().
// Por que existe: com mais de uma pessoa no painel, "o painel mudou o pedido" não diz quem. Aqui fica o e-mail de
// quem fez, o que foi feito, em qual item e quando. O diário só cresce: nada o apaga nem o edita.
//
// Falha do diário nunca desfaz nem trava a ação do dono (a mudança já foi feita): ela vai para o log do servidor.
// ============================================================================

import "server-only";
import { desc } from "drizzle-orm";
import { getDb } from "@/server/db";
import { adminAudit } from "@/server/db/schema";

/** Códigos das ações registradas (substantivo.verbo). A tela traduz cada um para uma frase. */
export const ACOES_AUDITADAS = [
  "pedido.status",
  "pedido.rastreio",
  "produto.criar",
  "produto.editar",
  "produto.estoque",
  "produto.visibilidade",
  "encomenda.status",
  "cliente.senha-provisoria",
] as const;
export type AcaoAuditada = (typeof ACOES_AUDITADAS)[number];

/** Uma linha do diário, como a tela a lê. */
export type EntradaDoDiario = { id: number; ator: string; acao: string; alvo: string; detalhe: string; em: Date };

/**
 * Registra uma ação do painel. Sempre chamada DEPOIS de a mudança ter dado certo.
 * Nunca lança: se o diário falhar, a ação do dono já valeu e o erro só vai para o log.
 *
 * @param ator    e-mail do administrador (vem da sessão, nunca do formulário)
 * @param acao    o código da ação
 * @param alvo    o que foi mexido (ex.: "DW-00012", o endereço da peça)
 * @param detalhe um resumo curto do que mudou (ex.: "pago → enviado")
 */
export async function auditar(ator: string, acao: AcaoAuditada, alvo = "", detalhe = ""): Promise<void> {
  try {
    const db = await getDb();
    await db.insert(adminAudit).values({ actorEmail: ator, action: acao, target: alvo.slice(0, 120), detail: detalhe.slice(0, 300) });
  } catch (e) {
    console.error("[diario] não foi possível registrar a ação do painel:", acao, e);
  }
}

/** As ações mais recentes do painel, da mais nova para a mais antiga (no máximo `limite`, até 500). */
export async function listarAuditoria(limite = 200): Promise<EntradaDoDiario[]> {
  const n = Number.isInteger(limite) ? Math.min(Math.max(limite, 1), 500) : 200;
  const db = await getDb();
  const linhas = await db.select().from(adminAudit).orderBy(desc(adminAudit.at), desc(adminAudit.id)).limit(n);
  return linhas.map((l) => ({ id: l.id, ator: l.actorEmail, acao: l.action, alvo: l.target, detalhe: l.detail, em: l.at }));
}
