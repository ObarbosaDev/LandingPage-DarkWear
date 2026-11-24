// ============================================================================
// Testes do ESQUEMA de endereço (migração 0009): o banco recusa endereço pela metade ou inválido, na conta
// do cliente e na cópia guardada no pedido, mesmo que o código da aplicação tenha um bug.
// Falam SQL direto de propósito: provam a última barreira (o banco) sozinha.
// ============================================================================

import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { getDb } from "@/server/db";
import { clienteDeTeste, resetDb } from "./helpers/db";

beforeEach(resetDb);

async function recusado(consulta: string): Promise<boolean> {
  const db = await getDb();
  try {
    await db.execute(sql.raw(consulta));
    return false;
  } catch {
    return true;
  }
}

// Um endereço completo e válido, sobre o qual cada teste muda um campo (ou o apaga com null).
type Campos = { zip: string | null; street: string | null; number: string | null; complement: string | null; district: string | null; city: string | null; state: string | null };
const base: Campos = { zip: "01310100", street: "Avenida Paulista", number: "1000", complement: "Sala 12", district: "Bela Vista", city: "São Paulo", state: "SP" };
const lit = (v: string | null) => (v === null ? "NULL" : `'${v.replace(/'/g, "''")}'`);

/** UPDATE no cliente com o endereço informado (prefixo address_ na conta, ship_ no pedido). */
const naConta = (id: number, c: Partial<Campos>) => {
  const e = { ...base, ...c };
  return `UPDATE customers SET address_zip=${lit(e.zip)}, address_street=${lit(e.street)}, address_number=${lit(e.number)}, address_complement=${lit(e.complement)}, address_district=${lit(e.district)}, address_city=${lit(e.city)}, address_state=${lit(e.state)} WHERE id=${id}`;
};
const noPedido = (c: Partial<Campos>) => {
  const e = { ...base, ...c };
  return `INSERT INTO orders (status, total_cents, ship_zip, ship_street, ship_number, ship_complement, ship_district, ship_city, ship_state) VALUES ('pendente', 1000, ${lit(e.zip)}, ${lit(e.street)}, ${lit(e.number)}, ${lit(e.complement)}, ${lit(e.district)}, ${lit(e.city)}, ${lit(e.state)})`;
};

describe("endereço na conta do cliente", () => {
  it("aceita um endereço completo, com ou sem complemento, e aceita a conta sem endereço", async () => {
    const id = await clienteDeTeste();
    expect(await recusado(naConta(id, {}))).toBe(false);
    expect(await recusado(naConta(id, { complement: null }))).toBe(false);
    const nenhum: Campos = { zip: null, street: null, number: null, complement: null, district: null, city: null, state: null };
    expect(await recusado(naConta(id, nenhum))).toBe(false);
  });

  it.each([
    ["CEP com 7 dígitos", { zip: "0131010" }],
    ["CEP com 9 dígitos", { zip: "013101000" }],
    ["CEP com máscara", { zip: "01310-100" }],
    ["CEP com letras", { zip: "0131010A" }],
    ["UF inventada", { state: "XX" }],
    ["UF em minúscula", { state: "sp" }],
    ["UF com 3 letras", { state: "SPP" }],
    ["rua de 1 letra", { street: "A" }],
    ["rua só de espaços", { street: "   " }],
    ["rua enorme", { street: "x".repeat(121) }],
    ["número vazio", { number: "" }],
    ["número com 11 caracteres", { number: "12345678901" }],
    ["complemento enorme", { complement: "x".repeat(61) }],
    ["bairro curto", { district: "B" }],
    ["cidade enorme", { city: "x".repeat(81) }],
  ] as [string, Partial<Campos>][])("recusa: %s", async (_nome, campo) => {
    const id = await clienteDeTeste();
    expect(await recusado(naConta(id, campo))).toBe(true);
  });

  // "Todo ou nada": um endereço pela metade (só a rua, sem cidade) nunca pode ficar gravado.
  it.each(["zip", "street", "number", "district", "city", "state"] as const)("recusa endereço pela metade: só falta %s", async (campo) => {
    const id = await clienteDeTeste();
    expect(await recusado(naConta(id, { [campo]: null }))).toBe(true);
  });

  it("recusa complemento sozinho, sem o resto do endereço", async () => {
    const id = await clienteDeTeste();
    const so: Campos = { zip: null, street: null, number: null, complement: "Apto 3", district: null, city: null, state: null };
    expect(await recusado(naConta(id, so))).toBe(true);
  });
});

describe("cópia do endereço no pedido", () => {
  it("aceita pedido com endereço completo e pedido sem endereço (os antigos e os do WhatsApp)", async () => {
    expect(await recusado(noPedido({}))).toBe(false);
    const nenhum: Campos = { zip: null, street: null, number: null, complement: null, district: null, city: null, state: null };
    expect(await recusado(noPedido(nenhum))).toBe(false);
  });

  it.each([
    ["CEP inválido", { zip: "123" }],
    ["UF inventada", { state: "ZZ" }],
    ["cidade ausente", { city: null }],
    ["rua curta", { street: "A" }],
  ] as [string, Partial<Campos>][])("recusa: %s", async (_nome, campo) => {
    expect(await recusado(noPedido(campo))).toBe(true);
  });
});
