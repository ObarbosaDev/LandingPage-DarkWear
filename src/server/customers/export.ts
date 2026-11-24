// ============================================================================
// "BAIXAR MEUS DADOS" (LGPD): tudo o que a loja guarda DA PESSOA, num arquivo que ela pode levar.
//
// Quem usa: GET /api/conta/dados (o botão da tela /conta).
//
// O que entra: a conta (nome, e-mail, celular, quando criou e quando aceitou a política de privacidade), o endereço
// cadastrado e cada pedido dela (peças, valores, descontos, entrega, rastreio, andamento e pagamentos).
// O que NUNCA entra: a senha (nem o hash), o segundo fator, a versão da sessão, o papel, quem do painel mexeu no pedido
// (o e-mail do administrador não é dado do cliente), os códigos internos do Mercado Pago e qualquer dado de OUTRA pessoa.
// Os nomes dos campos são em português, para a própria pessoa conseguir ler o arquivo.
// ============================================================================

import "server-only";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/server/db";
import { customers, orderItems, orders, orderStatusHistory, payments } from "@/server/db/schema";
import { addressFromOrder, type Address } from "@/server/customers/address";
import { orderNumber } from "@/server/orders";

/** O endereço com os nomes em português, como sai no arquivo. */
type EnderecoExportado = { cep: string; rua: string; numero: string; complemento: string | null; bairro: string; cidade: string; estado: string };
const paraExportar = (a: Address): EnderecoExportado => ({ cep: a.zip, rua: a.street, numero: a.number, complemento: a.complement, bairro: a.district, cidade: a.city, estado: a.state });

/** O arquivo de dados de uma pessoa. */
export type DadosDoCliente = {
  geradoEm: string;
  conta: { nome: string; email: string; celular: string; criadaEm: string; aceitouAPoliticaDePrivacidadeEm: string };
  endereco: EnderecoExportado | null;
  pedidos: {
    numero: string;
    situacao: string;
    feitoEm: string;
    totalEmCentavos: number;
    descontos: { cupom: string | null; cupomEmCentavos: number; pixEmCentavos: number };
    rastreio: string | null;
    entregaEm: EnderecoExportado | null;
    itens: { nome: string; tamanho: string; cor: string; quantidade: number; precoUnitarioEmCentavos: number }[];
    andamento: { de: string | null; para: string; em: string }[];
    pagamentos: { situacao: string; forma: string | null; parcelas: number | null; valorEmCentavos: number | null; pagoEm: string | null }[];
  }[];
};

/**
 * Reúne os dados de UMA pessoa. Devolve null se a conta não existe, foi excluída (anonimizada) ou o id é inválido.
 * Todos os pedidos são buscados filtrando pelo dono NO BANCO, na mesma consulta.
 */
export async function exportCustomerData(customerId: number): Promise<DadosDoCliente | null> {
  if (!Number.isSafeInteger(customerId) || customerId < 1) return null;
  const db = await getDb();
  const [c] = await db.select().from(customers).where(and(eq(customers.id, customerId), isNull(customers.anonymizedAt)));
  if (!c) return null;

  const meus = await db.select().from(orders).where(eq(orders.customerId, customerId)).orderBy(desc(orders.createdAt), desc(orders.id));
  const ids = meus.map((o) => o.id);
  const [itens, historico, pagamentos] = ids.length
    ? await Promise.all([
        db.select().from(orderItems).where(inArray(orderItems.orderId, ids)),
        db.select().from(orderStatusHistory).where(inArray(orderStatusHistory.orderId, ids)).orderBy(asc(orderStatusHistory.at), asc(orderStatusHistory.id)),
        db.select().from(payments).where(inArray(payments.orderId, ids)).orderBy(asc(payments.createdAt), asc(payments.id)),
      ])
    : [[], [], []];

  const endereco =
    c.addressZip && c.addressStreet && c.addressNumber && c.addressDistrict && c.addressCity && c.addressState
      ? paraExportar({ zip: c.addressZip, street: c.addressStreet, number: c.addressNumber, complement: c.addressComplement, district: c.addressDistrict, city: c.addressCity, state: c.addressState })
      : null;

  return {
    geradoEm: new Date().toISOString(),
    conta: { nome: c.name, email: c.email, celular: c.phone, criadaEm: c.createdAt.toISOString(), aceitouAPoliticaDePrivacidadeEm: c.privacyAcceptedAt.toISOString() },
    endereco,
    pedidos: meus.map((o) => {
      const entrega = addressFromOrder(o);
      return {
        numero: orderNumber(o.id),
        situacao: o.status,
        feitoEm: o.createdAt.toISOString(),
        totalEmCentavos: o.totalCents,
        descontos: { cupom: o.couponCode, cupomEmCentavos: o.couponDiscountCents, pixEmCentavos: o.pixDiscountCents },
        rastreio: o.trackingCode,
        entregaEm: entrega ? paraExportar(entrega) : null,
        itens: itens
          .filter((i) => i.orderId === o.id)
          .map((i) => ({ nome: i.name, tamanho: i.size, cor: i.color, quantidade: i.qty, precoUnitarioEmCentavos: i.unitPriceCents })),
        // Só de onde veio, para onde foi e quando: nunca a origem interna nem o e-mail de quem do painel mexeu.
        andamento: historico.filter((h) => h.orderId === o.id).map((h) => ({ de: h.fromStatus, para: h.toStatus, em: h.at.toISOString() })),
        pagamentos: pagamentos
          .filter((p) => p.orderId === o.id)
          .map((p) => ({ situacao: p.status, forma: p.method, parcelas: p.installments, valorEmCentavos: p.amountCents, pagoEm: p.paidAt ? p.paidAt.toISOString() : null })),
      };
    }),
  };
}
