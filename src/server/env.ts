// ============================================================================
// Conferência das variáveis de ambiente (a "configuração" do servidor).
//
// Quem usa: src/instrumentation.ts, uma vez, quando o servidor sobe. Também é testada isoladamente.
// Por que existe: a maior parte dos problemas de publicação é configuração esquecida (banco, senha do
// painel, número de WhatsApp). Aqui elas são conferidas de uma vez e o resultado é um relatório de
// erros e avisos, em vez de descobrir quando um cliente tenta comprar.
// ============================================================================

import "server-only";
import { SITE } from "@/lib/site";

// Confere a configuração do ambiente uma vez, na subida do servidor (ver src/instrumentation.ts).
// "erro" é configuração que deixa o site quebrado ou inseguro; "aviso" é algo que o dono precisa saber.

/** Resultado da conferência: erros impedem a subida em produção; avisos só vão para o log. */
export type EnvReport = { errors: string[]; warnings: string[] };

// Formato das variáveis de ambiente (process.env tem este formato). Aceito como parâmetro para os
// testes poderem simular qualquer ambiente sem mexer no real.
type Env = Record<string, string | undefined>;

/** O número de WhatsApp de exemplo que vem no projeto. Se ele chegar à produção, é erro. */
export const WHATSAPP_EXEMPLO = "5500000000000";

/**
 * Confere a configuração e devolve o relatório.
 *
 * @param env      variáveis de ambiente a conferir (padrão: as do processo atual)
 * @param whatsapp número de WhatsApp configurado em src/lib/site.ts
 */
export function checkEnv(env: Env = process.env, whatsapp: string = SITE.whatsappNumber): EnvReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const producao = env.NODE_ENV === "production";
  const naVercel = Boolean(env.VERCEL);

  // Banco: na Vercel o disco some a cada execução, então sem DATABASE_URL os pedidos se perderiam.
  if (naVercel && !env.DATABASE_URL) {
    errors.push("DATABASE_URL não está definida. Provisione o Postgres (Neon) pelo Marketplace da Vercel e conecte ao projeto.");
  } else if (producao && !env.DATABASE_URL) {
    warnings.push("Sem DATABASE_URL: usando o banco local embutido, que não serve para hospedagem de verdade.");
  }

  // Painel do dono: as duas variáveis juntas, ou nenhuma (painel desativado).
  const senha = env.ADMIN_PASSWORD;
  const segredo = env.ADMIN_SESSION_SECRET;
  if (!senha && !segredo) {
    warnings.push("ADMIN_PASSWORD e ADMIN_SESSION_SECRET não definidas: o painel /admin está desativado.");
  } else {
    // Configurado pela metade quase sempre é esquecimento: tratado como erro.
    if (!senha) errors.push("ADMIN_PASSWORD não definida (o painel não abre sem ela).");
    if (!segredo) errors.push("ADMIN_SESSION_SECRET não definida (o painel não abre sem ela).");
    else if (segredo.length < 32) errors.push("ADMIN_SESSION_SECRET precisa ter pelo menos 32 caracteres.");
    if (senha && producao && senha.length < 12) warnings.push("ADMIN_PASSWORD tem menos de 12 caracteres: use uma senha mais longa.");
  }

  // Contas de cliente: comprar exige login, e o login depende deste segredo (assina o cookie da sessão).
  // Sem ele, ninguém consegue entrar e, portanto, ninguém consegue comprar: em produção é erro.
  const segredoCliente = env.CUSTOMER_SESSION_SECRET ?? "";
  if (segredoCliente.length < 32) {
    (producao ? errors : warnings).push(
      "CUSTOMER_SESSION_SECRET não definida ou com menos de 32 caracteres: cadastro e login de clientes (e, portanto, as compras) não funcionam.",
    );
  } else if (segredoCliente === segredo) {
    // Funciona (os tokens têm prefixos diferentes), mas uma chave vazada do painel passaria a comprometer as contas.
    warnings.push("CUSTOMER_SESSION_SECRET é igual ao ADMIN_SESSION_SECRET: use um valor diferente para cada um.");
  }

  // Expiração de pedidos pendentes: sem CRON_SECRET a rota do cron fica fechada e nada expira.
  if (producao && !env.CRON_SECRET) {
    warnings.push("CRON_SECRET não definida: pedidos pendentes não expiram e seguram o estoque até serem cancelados à mão.");
  }
  if (env.PENDING_ORDER_HOURS !== undefined) {
    const h = Number(env.PENDING_ORDER_HOURS);
    if (!Number.isFinite(h) || h <= 0) warnings.push("PENDING_ORDER_HOURS inválida: usando o padrão de 48 horas.");
  }

  // Mercado Pago (pagamento online): token e segredo do aviso andam juntos. Sem o segredo, o aviso
  // não tem assinatura conferida (a consulta ao Mercado Pago ainda protege o pedido, mas o endpoint
  // ficaria aberto a chamadas falsas). Sem https no SITE_URL, o Mercado Pago não consegue avisar.
  if (env.MERCADOPAGO_ACCESS_TOKEN) {
    if (producao && !env.MERCADOPAGO_WEBHOOK_SECRET) {
      warnings.push("MERCADOPAGO_WEBHOOK_SECRET não definida: os avisos de pagamento chegam sem conferir a assinatura.");
    }
    if (producao && !(env.SITE_URL ?? "").startsWith("https://")) {
      errors.push("Com o Mercado Pago ativo, SITE_URL precisa ser o endereço público com https:// (é para lá que ele avisa e devolve o cliente).");
    }
    if (producao && env.MERCADOPAGO_SANDBOX === "true") {
      warnings.push("MERCADOPAGO_SANDBOX=true em produção: os pagamentos são de TESTE e ninguém é cobrado de verdade.");
    }
  } else if (env.MERCADOPAGO_WEBHOOK_SECRET) {
    warnings.push("MERCADOPAGO_WEBHOOK_SECRET definida sem MERCADOPAGO_ACCESS_TOKEN: o pagamento online continua desligado.");
  }

  // Endereço do site (sitemap)
  if (producao && !env.SITE_URL) {
    warnings.push("SITE_URL não definida: o sitemap usa o endereço local. Defina, por exemplo, https://seusite.com.br");
  }

  // O número do WhatsApp fica em src/lib/site.ts. Só o site de produção de verdade é barrado por isso;
  // prévias e testes locais seguem com o número de exemplo, só com aviso.
  if (producao && whatsapp === WHATSAPP_EXEMPLO) {
    const msg = "O número de WhatsApp em src/lib/site.ts ainda é o de exemplo: os pedidos iriam para um número que não existe.";
    (env.VERCEL_ENV === "production" ? errors : warnings).push(msg);
  }

  return { errors, warnings };
}
