// ============================================================================
// Testes da CONFERÊNCIA DE CONFIGURAÇÃO (checkEnv em src/server/env.ts).
// Por que testar: ela decide se o servidor sobe ou não em produção, e quais avisos o dono recebe.
// Cada teste simula um "ambiente" diferente passando um objeto de variáveis (sem tocar no real).
// ============================================================================

import { describe, expect, it } from "vitest";
import { checkEnv, WHATSAPP_EXEMPLO } from "@/server/env";

// Um número de WhatsApp "real" (de mentira, mas diferente do de exemplo) e um segredo longo o bastante.
const REAL = "5511999999999";

// Um ambiente de produção completo e correto, sobre o qual cada teste muda um detalhe.
const completo = {
  NODE_ENV: "production",
  DATABASE_URL: "postgres://x",
  CUSTOMER_SESSION_SECRET: "y".repeat(40),
  CRON_SECRET: "cron",
  SITE_URL: "https://exemplo.com.br",
};

describe("checkEnv", () => {
  // O caso ideal: tudo configurado, nenhum aviso.
  it("ambiente de produção completo não tem erro nem aviso", () => {
    expect(checkEnv(completo, REAL)).toEqual({ errors: [], warnings: [] });
  });

  // No computador do desenvolvedor, sem nada configurado, só falta o segredo das contas (e só avisa).
  it("desenvolvimento sem nada configurado só avisa do segredo das contas", () => {
    const r = checkEnv({ NODE_ENV: "development" }, WHATSAPP_EXEMPLO);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatch(/CUSTOMER_SESSION_SECRET/);
  });

  // Na Vercel o disco some a cada execução: sem banco de verdade, os pedidos se perderiam.
  it("na Vercel, sem DATABASE_URL é erro", () => {
    const r = checkEnv({ ...completo, VERCEL: "1", DATABASE_URL: undefined }, REAL);
    expect(r.errors.join(" ")).toMatch(/DATABASE_URL/);
  });

  it("fora da Vercel, produção sem DATABASE_URL é só aviso", () => {
    const r = checkEnv({ ...completo, DATABASE_URL: undefined }, REAL);
    expect(r.errors).toEqual([]);
    expect(r.warnings.join(" ")).toMatch(/banco local/);
  });

  // O painel não tem mais senha própria: as variáveis antigas não são exigidas, e se ainda estiverem no ambiente
  // o sistema avisa que sobraram (sem impedir nada).
  it("o painel não exige mais ADMIN_PASSWORD nem ADMIN_SESSION_SECRET", () => {
    expect(checkEnv(completo, REAL)).toEqual({ errors: [], warnings: [] });
  });

  it.each(["ADMIN_PASSWORD", "ADMIN_SESSION_SECRET"])("%s que sobrou no ambiente gera aviso de que não é mais usada", (nome) => {
    const r = checkEnv({ ...completo, [nome]: "qualquer-coisa-com-mais-de-32-caracteres-aqui" }, REAL);
    expect(r.errors).toEqual([]);
    expect(r.warnings.join(" ")).toMatch(/não são mais usadas/);
  });

  it("avisa quando faltam CRON_SECRET e SITE_URL em produção", () => {
    const r = checkEnv({ ...completo, CRON_SECRET: undefined, SITE_URL: undefined }, REAL);
    expect(r.warnings.join(" ")).toMatch(/CRON_SECRET/);
    expect(r.warnings.join(" ")).toMatch(/SITE_URL/);
  });

  it("avisa de horas de expiração inválidas", () => {
    for (const v of ["abc", "0", "-3"]) {
      expect(checkEnv({ ...completo, PENDING_ORDER_HOURS: v }, REAL).warnings.join(" "), v).toMatch(/PENDING_ORDER_HOURS/);
    }
    expect(checkEnv({ ...completo, PENDING_ORDER_HOURS: "24" }, REAL).warnings).toEqual([]);
  });

  // O número de exemplo só barra a subida na produção de verdade; prévias e testes locais só recebem aviso
  // (senão ninguém conseguiria testar o site antes de ter o número real).
  it("número de WhatsApp de exemplo: erro na produção da Vercel, aviso nos demais", () => {
    expect(checkEnv({ ...completo, VERCEL: "1", VERCEL_ENV: "production" }, WHATSAPP_EXEMPLO).errors.join(" ")).toMatch(/WhatsApp/);
    const previa = checkEnv({ ...completo, VERCEL: "1", VERCEL_ENV: "preview" }, WHATSAPP_EXEMPLO);
    expect(previa.errors).toEqual([]);
    expect(previa.warnings.join(" ")).toMatch(/WhatsApp/);
    const local = checkEnv(completo, WHATSAPP_EXEMPLO);
    expect(local.errors).toEqual([]);
    expect(local.warnings.join(" ")).toMatch(/WhatsApp/);
  });
});

// Mercado Pago: pagamento online só pode ir ao ar completo (token + segredo do aviso + site com https).
describe("checkEnv: Mercado Pago", () => {
  const mp = { ...completo, MERCADOPAGO_ACCESS_TOKEN: "APP_USR-x", MERCADOPAGO_WEBHOOK_SECRET: "segredo" };

  it("configuração completa não tem erro nem aviso", () => {
    expect(checkEnv(mp, REAL)).toEqual({ errors: [], warnings: [] });
  });

  it("sem Mercado Pago, nada muda (só WhatsApp)", () => {
    expect(checkEnv(completo, REAL)).toEqual({ errors: [], warnings: [] });
  });

  it("sem segredo do aviso: aviso (a assinatura não será conferida)", () => {
    const r = checkEnv({ ...mp, MERCADOPAGO_WEBHOOK_SECRET: undefined }, REAL);
    expect(r.errors).toEqual([]);
    expect(r.warnings.join(" ")).toMatch(/WEBHOOK_SECRET/);
  });

  it.each([undefined, "", "http://exemplo.com.br", "exemplo.com.br"])("SITE_URL %j com Mercado Pago ativo é erro em produção", (url) => {
    expect(checkEnv({ ...mp, SITE_URL: url }, REAL).errors.join(" ")).toMatch(/https/);
  });

  it("em desenvolvimento, SITE_URL sem https não é erro", () => {
    expect(checkEnv({ ...mp, NODE_ENV: "development", SITE_URL: undefined }, REAL).errors).toEqual([]);
  });

  it("modo de teste em produção avisa que ninguém é cobrado de verdade", () => {
    expect(checkEnv({ ...mp, MERCADOPAGO_SANDBOX: "true" }, REAL).warnings.join(" ")).toMatch(/TESTE/);
  });

  it("segredo do aviso sem token avisa que o pagamento continua desligado", () => {
    expect(checkEnv({ ...completo, MERCADOPAGO_WEBHOOK_SECRET: "x" }, REAL).warnings.join(" ")).toMatch(/desligado/);
  });
});

// Contas de cliente: comprar exige login, e o login depende do segredo que assina o cookie.
describe("checkEnv: sessão do cliente", () => {
  it("em produção, sem CUSTOMER_SESSION_SECRET é erro (ninguém conseguiria comprar)", () => {
    const r = checkEnv({ ...completo, CUSTOMER_SESSION_SECRET: undefined }, REAL);
    expect(r.errors.join(" ")).toMatch(/CUSTOMER_SESSION_SECRET/);
  });

  it.each(["", "curto", "x".repeat(31)])("em produção, segredo %j (menos de 32 caracteres) é erro", (segredo) => {
    expect(checkEnv({ ...completo, CUSTOMER_SESSION_SECRET: segredo }, REAL).errors.join(" ")).toMatch(/32/);
  });

  it("com 32 caracteres ou mais, está certo", () => {
    expect(checkEnv({ ...completo, CUSTOMER_SESSION_SECRET: "x".repeat(32) }, REAL).errors).toEqual([]);
  });

  it("em desenvolvimento, sem o segredo é só aviso", () => {
    const r = checkEnv({ NODE_ENV: "development", CUSTOMER_SESSION_SECRET: undefined }, WHATSAPP_EXEMPLO);
    expect(r.errors).toEqual([]);
    expect(r.warnings.join(" ")).toMatch(/CUSTOMER_SESSION_SECRET/);
  });

});
