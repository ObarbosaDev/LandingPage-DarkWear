// ============================================================================
// Testes do ESQUEMA de clientes (migração 0007): o próprio banco precisa recusar dado inválido de
// cliente e manter o pedido ligado a ele, mesmo que o código da aplicação tenha um bug.
// Falam SQL direto de propósito: provam a última barreira (o banco) sozinha.
// ============================================================================

import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { getDb } from "@/server/db";
import { resetDb } from "./helpers/db";

beforeEach(resetDb);

/** Roda um SQL solto e diz se o banco o recusou (true) ou aceitou (false). */
async function recusado(consulta: string): Promise<boolean> {
  const db = await getDb();
  try {
    await db.execute(sql.raw(consulta));
    return false;
  } catch {
    return true;
  }
}

/** Roda um SELECT solto e devolve as linhas (o tipo do resultado do execute é genérico demais). */
async function linhas(consulta: string): Promise<Record<string, unknown>[]> {
  const db = await getDb();
  return ((await db.execute(sql.raw(consulta))) as unknown as { rows: Record<string, unknown>[] }).rows;
}

// Um cliente válido, sobre o qual cada teste muda um detalhe.
const cliente = (o: { name?: string; email?: string; phone?: string } = {}) =>
  `INSERT INTO customers (name, email, phone, password_hash, privacy_accepted_at)
   VALUES ('${o.name ?? "Ana Souza"}', '${o.email ?? "ana@exemplo.com"}', '${o.phone ?? "11987654321"}', 'hash', now())`;

describe("tabela customers", () => {
  it("aceita um cliente válido, com versão de sessão 1 e sem troca de senha pendente", async () => {
    expect(await recusado(cliente())).toBe(false);
    const r = await linhas("SELECT session_version, must_change_password, anonymized_at FROM customers");
    expect(r[0]).toMatchObject({ session_version: 1, must_change_password: false, anonymized_at: null });
  });

  it("recusa e-mail repetido, inclusive com maiúsculas (o banco exige minúsculas)", async () => {
    expect(await recusado(cliente())).toBe(false);
    expect(await recusado(cliente())).toBe(true); // repetido
    expect(await recusado(cliente({ email: "Ana@Exemplo.com" }))).toBe(true); // maiúsculas
  });

  it("recusa nome vazio ou só de espaços", async () => {
    expect(await recusado(cliente({ name: "" }))).toBe(true);
    expect(await recusado(cliente({ name: "   " }))).toBe(true);
  });

  it("recusa celular com letras ou com tamanho errado", async () => {
    for (const phone of ["abc", "1198765", "119876543210", "11 98765-4321"]) {
      expect(await recusado(cliente({ phone, email: `x${phone.length}@exemplo.com` })), phone).toBe(true);
    }
  });

  it("atualiza updated_at sozinho ao alterar o cliente", async () => {
    const db = await getDb();
    await db.execute(sql.raw(cliente()));
    await db.execute(sql.raw("UPDATE customers SET updated_at = now() - interval '1 day'"));
    await db.execute(sql.raw("UPDATE customers SET name = 'Ana Maria'"));
    const r = await linhas("SELECT updated_at > now() - interval '1 minute' AS novo FROM customers");
    expect(r[0]).toMatchObject({ novo: true });
  });
});

describe("orders.customer_id", () => {
  it("aceita pedido sem cliente (os antigos) e com cliente existente", async () => {
    const db = await getDb();
    await db.execute(sql.raw(cliente()));
    expect(await recusado("INSERT INTO orders (status, total_cents) VALUES ('pendente', 1000)")).toBe(false);
    const r = await linhas("SELECT id FROM customers");
    expect(await recusado(`INSERT INTO orders (status, total_cents, customer_id) VALUES ('pendente', 1000, ${r[0].id})`)).toBe(false);
  });

  it("recusa pedido de cliente que não existe", async () => {
    expect(await recusado("INSERT INTO orders (status, total_cents, customer_id) VALUES ('pendente', 1000, 999999)")).toBe(true);
  });
});
