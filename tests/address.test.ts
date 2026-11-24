// ============================================================================
// Testes do ENDEREÇO (src/server/customers/address.ts): conferir o formulário, gravar na conta e formatar.
// Por que testar: o endereço vira etiqueta de envio e, na etapa seguinte, parte de uma consulta de frete. Um
// campo com lixo, quebra de linha ou tamanho absurdo estragaria a etiqueta ou a consulta, e um endereço pela
// metade faria o pedido sair para lugar nenhum.
// ============================================================================

import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import { customers } from "@/server/db/schema";
import { anonymizeCustomer } from "@/server/customers";
import { UFS, formatAddress, formatCep, getAddress, parseAddressForm, saveAddress } from "@/server/customers/address";
import { clienteDeTeste, resetDb } from "./helpers/db";

beforeEach(resetDb);

const form = (o: Record<string, string | null> = {}): FormData => {
  const f = new FormData();
  const base: Record<string, string | null> = { cep: "01310-100", street: "Avenida Paulista", number: "1000", complement: "Sala 12", district: "Bela Vista", city: "São Paulo", state: "SP", ...o };
  for (const [k, v] of Object.entries(base)) if (v !== null) f.set(k, v);
  return f;
};
const valido = { zip: "01310100", street: "Avenida Paulista", number: "1000", complement: "Sala 12", district: "Bela Vista", city: "São Paulo", state: "SP" };

describe("parseAddressForm", () => {
  it("aceita um endereço válido e devolve os campos limpos (CEP só com dígitos)", () => {
    expect(parseAddressForm(form())).toEqual({ ok: true, data: valido });
  });

  it("limpa espaços repetidos e nas pontas, e põe a UF em maiúscula", () => {
    const r = parseAddressForm(form({ street: "  Rua   das   Flores ", city: " Belo  Horizonte ", state: " mg ", number: " 12 " }));
    expect(r).toMatchObject({ ok: true, data: { street: "Rua das Flores", city: "Belo Horizonte", state: "MG", number: "12" } });
  });

  it("o complemento é opcional: vazio ou ausente vira null", () => {
    for (const complement of ["", "   ", null]) expect(parseAddressForm(form({ complement })), String(complement)).toMatchObject({ ok: true, data: { complement: null } });
  });

  it.each(["01310100", "01310-100", " 01310-100 ", "01.310-100", "01 310 100"])("aceita o CEP %j (com máscara ou espaços)", (cep) => {
    expect(parseAddressForm(form({ cep }))).toMatchObject({ ok: true, data: { zip: "01310100" } });
  });

  // O CEP vira parte de um endereço de consulta externa: só 8 dígitos, nada mais, jamais.
  it.each(["", "123", "0131010", "013101000", "0131010A", "abcdefgh", "../../etc", "01310100/../x", "01310100?x=1", "%30131010", "01310100\n", "01310100;ls", "0131010٠", "０１３１０１００"])(
    "recusa o CEP %j",
    (cep) => {
      expect(parseAddressForm(form({ cep }))).toMatchObject({ ok: false, error: expect.stringMatching(/CEP/) });
    },
  );

  it.each([["A"], [""], ["   "], ["x".repeat(121)]])("recusa a rua %j", (street) => {
    expect(parseAddressForm(form({ street }))).toMatchObject({ ok: false, error: expect.stringMatching(/rua/i) });
  });

  it.each([[""], ["   "], ["12345678901"]])("recusa o número %j", (number) => {
    expect(parseAddressForm(form({ number }))).toMatchObject({ ok: false, error: expect.stringMatching(/número/i) });
  });

  it("aceita 'S/N' e números com letra", () => {
    for (const number of ["S/N", "s/n", "12A", "1000"]) expect(parseAddressForm(form({ number })).ok, number).toBe(true);
  });

  it("recusa complemento com mais de 60 caracteres", () => {
    expect(parseAddressForm(form({ complement: "x".repeat(61) }))).toMatchObject({ ok: false, error: expect.stringMatching(/complemento/i) });
    expect(parseAddressForm(form({ complement: "x".repeat(60) })).ok).toBe(true);
  });

  it.each([["B"], [""], ["x".repeat(81)]])("recusa bairro e cidade %j", (v) => {
    expect(parseAddressForm(form({ district: v }))).toMatchObject({ ok: false, error: expect.stringMatching(/bairro/i) });
    expect(parseAddressForm(form({ city: v }))).toMatchObject({ ok: false, error: expect.stringMatching(/cidade/i) });
  });

  it.each(["XX", "", "S", "SPP", "São Paulo", "12", "--"])("recusa a UF %j", (state) => {
    expect(parseAddressForm(form({ state }))).toMatchObject({ ok: false, error: expect.stringMatching(/estado/i) });
  });

  it("as 27 UFs do Brasil são aceitas", () => {
    expect(UFS).toHaveLength(27);
    for (const state of UFS) expect(parseAddressForm(form({ state })).ok, state).toBe(true);
  });

  // Caracteres de controle (quebra de linha, tabulação, nulo) estragariam a etiqueta e poderiam atravessar para outros textos.
  it.each(["street", "number", "complement", "district", "city"])("recusa caractere de controle no campo %s", (campo) => {
    for (const lixo of ["Rua\nA", "Rua\rA", "Rua\tA", "Rua\u0000A", "Rua A"]) {
      expect(parseAddressForm(form({ [campo]: lixo })).ok, `${campo}:${JSON.stringify(lixo)}`).toBe(false);
    }
  });

  it("campos ausentes ou arquivos no lugar de texto não quebram", () => {
    expect(parseAddressForm(new FormData()).ok).toBe(false);
    const f = form();
    f.set("street", new File(["x"], "x.txt"));
    expect(parseAddressForm(f).ok).toBe(false);
  });
});

describe("saveAddress e getAddress", () => {
  it("grava e devolve o endereço da conta", async () => {
    const id = await clienteDeTeste();
    expect(await getAddress(id)).toBeNull(); // ainda sem endereço
    expect(await saveAddress(id, valido)).toBe(true);
    expect(await getAddress(id)).toEqual(valido);
  });

  it("trocar o endereço substitui o anterior por inteiro (inclusive apagando o complemento)", async () => {
    const id = await clienteDeTeste();
    await saveAddress(id, valido);
    await saveAddress(id, { ...valido, street: "Rua Nova", complement: null });
    expect(await getAddress(id)).toEqual({ ...valido, street: "Rua Nova", complement: null });
  });

  it("não grava em conta inexistente, anonimizada ou com id inválido", async () => {
    const id = await clienteDeTeste();
    await anonymizeCustomer(id);
    for (const alvo of [id, 999999, 0, -1, 1.5, NaN]) expect(await saveAddress(alvo, valido), String(alvo)).toBe(false);
  });

  it("endereço de uma conta nunca aparece em outra", async () => {
    const a = await clienteDeTeste("a@exemplo.com");
    const b = await clienteDeTeste("b@exemplo.com");
    await saveAddress(a, valido);
    expect(await getAddress(b)).toBeNull();
  });

  it("o banco recusa gravar o endereço pela metade", async () => {
    const id = await clienteDeTeste();
    await expect((await getDb()).update(customers).set({ addressStreet: "Rua X" }).where(eq(customers.id, id))).rejects.toThrow();
    expect(await getAddress(id)).toBeNull();
  });

  it("anonimizar a conta apaga o endereço dela", async () => {
    const id = await clienteDeTeste();
    await saveAddress(id, valido);
    await anonymizeCustomer(id);
    const [c] = await (await getDb()).select().from(customers).where(eq(customers.id, id));
    expect([c.addressZip, c.addressStreet, c.addressNumber, c.addressComplement, c.addressDistrict, c.addressCity, c.addressState]).toEqual([null, null, null, null, null, null, null]);
  });
});

describe("formatCep e formatAddress", () => {
  it("formata o CEP com hífen", () => {
    expect(formatCep("01310100")).toBe("01310-100");
    expect(formatCep("abc")).toBe("abc"); // valor estranho passa como veio, sem quebrar
  });

  it("monta as linhas da etiqueta de envio", () => {
    expect(formatAddress(valido)).toEqual(["Avenida Paulista, 1000 - Sala 12", "Bela Vista, São Paulo - SP", "CEP 01310-100"]);
    expect(formatAddress({ ...valido, complement: null })).toEqual(["Avenida Paulista, 1000", "Bela Vista, São Paulo - SP", "CEP 01310-100"]);
  });
});

// SEGUNDA barreira: a leitura nunca devolve endereço incompleto, mesmo que o banco deixasse um passar. Para provar,
// este teste REMOVE a trava do banco (só neste arquivo de teste, que tem o seu próprio banco em memória) e grava
// um endereço pela metade à força. Fica por último de propósito: depois dele a trava não existe mais.
describe("getAddress: defesa em profundidade", () => {
  it.each(["address_zip", "address_street", "address_number", "address_district", "address_city", "address_state"])(
    "nunca devolve o endereço se faltar %s, mesmo sem a trava do banco",
    async (coluna) => {
      const { sql } = await import("drizzle-orm");
      const db = await getDb();
      await db.execute(sql.raw("ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_endereco_valido"));
      const id = await clienteDeTeste(`meio-${coluna}@exemplo.com`);
      await saveAddress(id, valido);
      expect(await getAddress(id)).toEqual(valido); // completo: volta
      await db.execute(sql.raw(`UPDATE customers SET ${coluna} = NULL WHERE id = ${id}`));
      expect(await getAddress(id), coluna).toBeNull(); // pela metade: null
    },
  );
});

