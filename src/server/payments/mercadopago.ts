// ============================================================================
// Cliente do MERCADO PAGO: o único arquivo que "fala" com a API deles.
//
// Quem usa: src/server/payments/index.ts (criar a página de pagamento e aplicar um pagamento a um
// pedido) e a rota do webhook (/api/webhooks/mercadopago).
//
// Como o pagamento funciona (Checkout Pro, a página de pagamento hospedada pelo Mercado Pago):
//   1. criamos uma "preferência" (a cobrança, com os itens e o valor) e recebemos o endereço da página;
//   2. o cliente é levado a essa página e digita o cartão LÁ: os dados do cartão NUNCA passam pelo
//      nosso site nem pelo nosso servidor (por isso não temos obrigação de certificação PCI);
//   3. o Mercado Pago nos avisa (webhook) quando o pagamento muda de situação;
//   4. nós buscamos o pagamento na API deles, com o nosso token, e só então marcamos o pedido como pago.
//
// O passo 4 é a proteção principal: um aviso falso até pode chegar, mas ele só traz um número de
// pagamento. Quem decide se o pagamento existe e foi aprovado é a resposta da API do Mercado Pago,
// que ninguém além de nós consegue consultar com o nosso token.
//
// Documentação oficial: https://www.mercadopago.com.br/developers/pt/docs
// ============================================================================

import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { PRAZO_ONLINE_HORAS } from "@/lib/prazos";
import type { PaymentStatus } from "@/server/db/schema";

const API = "https://api.mercadopago.com";

/** Erro ao falar com o Mercado Pago. "status" é o código HTTP da resposta deles, quando houve. */
export class PagamentoError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

/** Diz se o pagamento online está configurado (existe o token de acesso). Sem token, só WhatsApp. */
export const mpConfigurado = (): boolean => Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN);

/** O token de acesso, ou erro claro se não estiver configurado. Nunca vai para o navegador nem para o log. */
function token(): string {
  const t = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!t) throw new PagamentoError("Mercado Pago não configurado (falta MERCADOPAGO_ACCESS_TOKEN).");
  return t;
}

/**
 * Faz uma chamada à API do Mercado Pago e devolve o JSON da resposta.
 * Tem prazo de 10 segundos: se o Mercado Pago demorar, o cliente não pode ficar esperando a sacola.
 * O corpo do erro não é copiado para a mensagem (pode conter dados do cliente); só o código HTTP.
 */
async function chamar<T>(caminho: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${caminho}`, {
      ...init,
      headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json", ...init.headers },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    if (e instanceof PagamentoError) throw e;
    throw new PagamentoError("Não foi possível falar com o Mercado Pago (rede ou tempo esgotado).");
  }
  if (!res.ok) throw new PagamentoError(`O Mercado Pago respondeu com erro ${res.status}.`, res.status);
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Tradução de status
// ---------------------------------------------------------------------------

/**
 * Traduz o status do Mercado Pago para o nosso (ver PAYMENT_STATUS no esquema do banco).
 * Qualquer status desconhecido vira "pendente": o pedido NUNCA é marcado como pago por um status
 * que não reconhecemos. Só "approved" aprova.
 */
export function traduzirStatus(bruto: string): PaymentStatus {
  switch (bruto) {
    case "approved":
      return "aprovado";
    case "rejected":
      return "recusado";
    case "cancelled":
      return "cancelado";
    case "refunded":
    case "charged_back":
      return "estornado";
    // pending, in_process, in_mediation, authorized e qualquer outro: ainda não é um "sim".
    default:
      return "pendente";
  }
}

// ---------------------------------------------------------------------------
// Criar a página de pagamento (preferência)
// ---------------------------------------------------------------------------

/** O que precisamos saber de um pedido para cobrar. */
export type DadosCobranca = {
  pedidoId: number;
  /** Número mostrado ao cliente (DW-00042). */
  numero: string;
  itens: { nome: string; qty: number; precoCents: number }[];
  /** Endereço público do site, com https (ex.: https://seusite.com.br). */
  baseUrl: string;
  /** Só Pix na página de pagamento (o cliente escolheu o desconto de Pix): cartões, boleto e saldo ficam de fora. */
  somentePix?: boolean;
};

// Todos os tipos de pagamento do Mercado Pago, menos o Pix ("bank_transfer"). Usado quando só o Pix deve aparecer.
const TIPOS_FORA_DO_PIX = ["credit_card", "debit_card", "prepaid_card", "ticket", "atm", "account_money"];

/**
 * Cria a página de pagamento no Mercado Pago e devolve o endereço para onde levar o cliente.
 *
 * Decisões importantes desta chamada:
 *   - external_reference = o id do pedido: é como o aviso (webhook) nos diz de qual pedido é o pagamento;
 *   - notification_url = onde o Mercado Pago nos avisa (precisa ser HTTPS e público);
 *   - back_urls = para onde o cliente volta depois de pagar (a página mostra o status REAL do banco);
 *   - boleto fica de fora: leva dias para compensar e seguraria as peças no estoque por esse tempo;
 *   - parcelas: MERCADOPAGO_MAX_INSTALLMENTS (padrão 1, à vista). Parcelar sem juros custa taxa à loja:
 *     essa é uma decisão do dono, por isso o padrão é o mais conservador;
 *   - somentePix: a página oferece apenas Pix. O Mercado Pago só aceita EXCLUIR tipos, então todos os outros são excluídos;
 *   - a cobrança expira em PRAZO_ONLINE_HORAS, o mesmo prazo em que o pedido com cobrança online é cancelado.
 */
export async function criarPreferencia(d: DadosCobranca): Promise<{ id: string; url: string }> {
  const parcelas = Number(process.env.MERCADOPAGO_MAX_INSTALLMENTS);
  const maxParcelas = Number.isInteger(parcelas) && parcelas >= 1 && parcelas <= 12 ? parcelas : 1;
  const retorno = `${d.baseUrl}/pagamento/retorno?pedido=${encodeURIComponent(d.numero)}`;
  // O Mercado Pago pede a data com fuso (ex.: -04:00): "+00:00" é o horário universal.
  const expira = new Date(Date.now() + PRAZO_ONLINE_HORAS * 3600 * 1000).toISOString().replace("Z", "+00:00");

  const resposta = await chamar<{ id: string; init_point?: string; sandbox_init_point?: string }>("/checkout/preferences", {
    method: "POST",
    body: JSON.stringify({
      items: d.itens.map((i) => ({
        title: i.nome,
        quantity: i.qty,
        currency_id: "BRL",
        // O Mercado Pago recebe o preço em reais (decimal), enquanto nós guardamos centavos inteiros.
        unit_price: i.precoCents / 100,
      })),
      external_reference: String(d.pedidoId),
      notification_url: `${d.baseUrl}/api/webhooks/mercadopago`,
      back_urls: { success: retorno, pending: retorno, failure: retorno },
      auto_return: "approved",
      payment_methods: { installments: maxParcelas, excluded_payment_types: (d.somentePix ? TIPOS_FORA_DO_PIX : ["ticket"]).map((id) => ({ id })) },
      expires: true,
      expiration_date_to: expira,
    }),
  });

  // Com credenciais de TESTE, o Mercado Pago usa outro endereço (sandbox). MERCADOPAGO_SANDBOX=true liga isso.
  const sandbox = process.env.MERCADOPAGO_SANDBOX === "true";
  const url = sandbox ? resposta.sandbox_init_point : resposta.init_point;
  if (!resposta.id || !url) throw new PagamentoError("O Mercado Pago não devolveu o endereço da página de pagamento.");
  return { id: resposta.id, url };
}

// ---------------------------------------------------------------------------
// Consultar um pagamento
// ---------------------------------------------------------------------------

/** Um pagamento já traduzido para o nosso formato. */
export type PagamentoMP = {
  /** O número do pagamento no Mercado Pago. */
  id: string;
  /** Nosso status (aprovado, pendente...). */
  status: PaymentStatus;
  /** O status original do Mercado Pago, para registro e diagnóstico. */
  statusBruto: string;
  /** O id do nosso pedido (o que enviamos como external_reference). */
  externalReference: string | null;
  /** Valor cobrado, em centavos. */
  valorCents: number;
  /** Forma de pagamento: credit_card, debit_card, pix... */
  metodo: string | null;
  parcelas: number | null;
  aprovadoEm: Date | null;
};

/**
 * Busca um pagamento na API do Mercado Pago e o devolve no nosso formato.
 * É esta consulta (com o nosso token) que decide se um pagamento é real: ver o comentário do topo.
 */
export async function buscarPagamento(id: string): Promise<PagamentoMP> {
  // O id vem de um aviso externo: só números são aceitos (impede montar um caminho de API estranho).
  if (!/^\d{1,20}$/.test(id)) throw new PagamentoError("Número de pagamento inválido.", 400);
  const p = await chamar<{
    id: number | string;
    status: string;
    external_reference?: string | null;
    transaction_amount: number | string;
    payment_type_id?: string | null;
    installments?: number | null;
    date_approved?: string | null;
  }>(`/v1/payments/${id}`);

  return {
    id: String(p.id),
    status: traduzirStatus(p.status),
    statusBruto: p.status,
    externalReference: p.external_reference ?? null,
    // O valor pode vir como número ou texto ("24.50"); vira centavos inteiros, sem erro de ponto flutuante.
    valorCents: Math.round(Number(p.transaction_amount) * 100),
    metodo: p.payment_type_id ?? null,
    parcelas: p.installments ?? null,
    aprovadoEm: p.date_approved ? new Date(p.date_approved) : null,
  };
}

// ---------------------------------------------------------------------------
// Assinatura do webhook
// ---------------------------------------------------------------------------

/**
 * Confere a assinatura que o Mercado Pago coloca em cada aviso (cabeçalho x-signature).
 *
 * O cabeçalho vem como "ts=<horário>,v1=<assinatura>". A assinatura é um HMAC-SHA256 de um texto
 * montado com o número do pagamento, o x-request-id e o horário, usando a "assinatura secreta" do
 * painel do Mercado Pago (MERCADOPAGO_WEBHOOK_SECRET).
 *
 * ATENÇÃO: o formato exato do texto ("id:...;request-id:...;ts:...;") não pôde ser confirmado na
 * documentação lida durante o desenvolvimento. Antes de publicar, teste com o botão "Simular" do
 * painel de integrações do Mercado Pago. Se a verificação recusar avisos verdadeiros, ajuste só esta
 * função. Isso NÃO enfraquece a segurança do pagamento: a proteção principal é buscarPagamento.
 */
export function assinaturaValida(p: { xSignature: string | null; xRequestId: string | null; dataId: string | null; secret: string }): boolean {
  if (!p.xSignature) return false;
  // Quebra "ts=123,v1=abc" em { ts: "123", v1: "abc" }.
  const partes = Object.fromEntries(
    p.xSignature
      .split(",")
      .map((x) => x.trim().split("="))
      .filter((x) => x.length >= 2)
      .map(([k, ...v]) => [k, v.join("=")]),
  );
  const ts = partes.ts;
  const v1 = partes.v1;
  if (!ts || !v1) return false;

  // O texto assinado inclui só as partes que existem, na ordem: id, request-id, ts.
  let manifesto = "";
  if (p.dataId) manifesto += `id:${p.dataId.toLowerCase()};`;
  if (p.xRequestId) manifesto += `request-id:${p.xRequestId};`;
  manifesto += `ts:${ts};`;

  const esperada = createHmac("sha256", p.secret).update(manifesto).digest("hex");
  const a = Buffer.from(esperada);
  const b = Buffer.from(v1);
  // Comparação em tempo constante (não revela a assinatura certa pelo tempo de resposta).
  return a.length === b.length && timingSafeEqual(a, b);
}
