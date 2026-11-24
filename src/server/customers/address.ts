// ============================================================================
// ENDEREÇO de entrega: conferir o formulário, gravar na conta do cliente, ler e formatar.
//
// Quem usa: a ação de salvar o endereço (src/app/actions-cliente.ts), a rota de pedidos (que copia o endereço
// para o pedido), a página da conta e as telas que mostram onde entregar (comprovante e painel).
//
// Princípios:
//   1. Tudo que vem do formulário é não confiável: cada campo é conferido aqui, e o banco confere de novo
//      (migração 0009: ou não há endereço, ou ele está completo e válido).
//   2. O CEP é só 8 dígitos ASCII, nada mais. Ele vira parte de um endereço de consulta externa (ViaCEP) e,
//      depois, de uma consulta de frete: qualquer outra coisa ("../", "?", "%", letras) é recusada aqui.
//   3. Texto livre (rua, bairro, cidade...) não aceita caractere de controle (quebra de linha, tabulação, nulo):
//      estragaria a etiqueta de envio e poderia atravessar para outros textos (mensagem do WhatsApp, por exemplo).
//   4. Um endereço pela metade nunca é devolvido: getAddress devolve o endereço completo ou null.
// ============================================================================

import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/server/db";
import { customers } from "@/server/db/schema";

/** Um endereço completo. O complemento é o único campo opcional. */
export type Address = {
  /** CEP só com os 8 dígitos (sem hífen). */
  zip: string;
  street: string;
  number: string;
  complement: string | null;
  district: string;
  city: string;
  state: string;
};

// As 27 unidades da federação ficam em src/lib/ufs.ts (o formulário, no navegador, usa a mesma lista).
import { UFS } from "@/lib/ufs";
export { UFS };

// Qualquer caractere de controle, inclusive os separadores de linha do Unicode.
const CONTROLE = /[\u0000-\u001f\u007f\u2028\u2029]/;

/** O texto de um campo do formulário (campo ausente ou arquivo no lugar de texto vira ""). */
const texto = (form: FormData, campo: string): string => (typeof form.get(campo) === "string" ? (form.get(campo) as string) : "");

/**
 * Limpa um campo de texto livre: recusa caractere de controle, junta espaços repetidos e apara as pontas.
 * Devolve o texto limpo, ou null se tinha caractere de controle.
 */
function limpar(bruto: string): string | null {
  if (CONTROLE.test(bruto)) return null;
  return bruto.trim().replace(/\s+/g, " ");
}

/**
 * Confere o formulário de endereço e devolve os dados limpos, ou a mensagem do primeiro problema.
 * Campos: cep, street, number, complement, district, city, state.
 */
export function parseAddressForm(form: FormData): { ok: true; data: Address } | { ok: false; error: string } {
  // CEP: só dígitos ASCII, com ou sem máscara (hífen, ponto, espaço). Nada mais, nem quebra de linha no fim.
  const cepBruto = texto(form, "cep");
  const zip = cepBruto.replace(/[ .-]/g, "");
  if (!/^[0-9 .-]+$/.test(cepBruto) || !/^[0-9]{8}$/.test(zip)) return { ok: false, error: "Informe um CEP válido, com 8 números." };

  const street = limpar(texto(form, "street"));
  if (street === null || street.length < 2 || street.length > 120) return { ok: false, error: "Informe a rua (de 2 a 120 caracteres, sem quebra de linha)." };

  const number = limpar(texto(form, "number"));
  if (number === null || number.length < 1 || number.length > 10) return { ok: false, error: "Informe o número (até 10 caracteres, ou S/N se não houver)." };

  const complementoLimpo = limpar(texto(form, "complement"));
  if (complementoLimpo === null || complementoLimpo.length > 60) return { ok: false, error: "O complemento pode ter até 60 caracteres, sem quebra de linha." };
  const complement = complementoLimpo === "" ? null : complementoLimpo;

  const district = limpar(texto(form, "district"));
  if (district === null || district.length < 2 || district.length > 80) return { ok: false, error: "Informe o bairro (de 2 a 80 caracteres)." };

  const city = limpar(texto(form, "city"));
  if (city === null || city.length < 2 || city.length > 80) return { ok: false, error: "Informe a cidade (de 2 a 80 caracteres)." };

  const state = texto(form, "state").trim().toUpperCase();
  if (!(UFS as readonly string[]).includes(state)) return { ok: false, error: "Escolha o estado (a sigla, como SP)." };

  return { ok: true, data: { zip, street, number, complement, district, city, state } };
}

/**
 * Grava o endereço na conta (substitui o anterior por inteiro).
 * @returns false se a conta não existe, foi excluída ou o id é inválido
 */
export async function saveAddress(customerId: number, a: Address): Promise<boolean> {
  if (!Number.isSafeInteger(customerId) || customerId < 1) return false;
  const db = await getDb();
  const feito = await db
    .update(customers)
    .set({
      addressZip: a.zip,
      addressStreet: a.street,
      addressNumber: a.number,
      addressComplement: a.complement,
      addressDistrict: a.district,
      addressCity: a.city,
      addressState: a.state,
    })
    .where(and(eq(customers.id, customerId), isNull(customers.anonymizedAt)))
    .returning({ id: customers.id });
  return feito.length > 0;
}

/** O endereço da conta, ou null se a pessoa ainda não cadastrou (ou se faltar qualquer parte dele). */
export async function getAddress(customerId: number): Promise<Address | null> {
  if (!Number.isSafeInteger(customerId) || customerId < 1) return null;
  const db = await getDb();
  const [c] = await db.select().from(customers).where(and(eq(customers.id, customerId), isNull(customers.anonymizedAt)));
  if (!c || !c.addressZip || !c.addressStreet || !c.addressNumber || !c.addressDistrict || !c.addressCity || !c.addressState) return null;
  return {
    zip: c.addressZip,
    street: c.addressStreet,
    number: c.addressNumber,
    complement: c.addressComplement,
    district: c.addressDistrict,
    city: c.addressCity,
    state: c.addressState,
  };
}

/** "01310100" → "01310-100". Valor que não tem 8 dígitos passa como veio, sem quebrar. */
export function formatCep(zip: string): string {
  return /^[0-9]{8}$/.test(zip) ? `${zip.slice(0, 5)}-${zip.slice(5)}` : zip;
}

/** As linhas da etiqueta de envio: rua e número (com complemento), bairro e cidade, CEP. */
export function formatAddress(a: Address): string[] {
  return [`${a.street}, ${a.number}${a.complement ? ` - ${a.complement}` : ""}`, `${a.district}, ${a.city} - ${a.state}`, `CEP ${formatCep(a.zip)}`];
}

/**
 * A CÓPIA do endereço guardada num pedido (colunas ship_*), ou null se o pedido não tem (os antigos e os feitos
 * antes desta etapa) ou se faltar qualquer parte dela. É a leitura que o comprovante do cliente e o painel usam.
 */
export function addressFromOrder(o: {
  shipZip: string | null;
  shipStreet: string | null;
  shipNumber: string | null;
  shipComplement: string | null;
  shipDistrict: string | null;
  shipCity: string | null;
  shipState: string | null;
}): Address | null {
  if (!o.shipZip || !o.shipStreet || !o.shipNumber || !o.shipDistrict || !o.shipCity || !o.shipState) return null;
  return { zip: o.shipZip, street: o.shipStreet, number: o.shipNumber, complement: o.shipComplement, district: o.shipDistrict, city: o.shipCity, state: o.shipState };
}

