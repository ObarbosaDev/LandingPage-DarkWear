// ============================================================================
// Testes da CONFERÊNCIA DE CONFIGURAÇÃO (checkEnv em src/server/env.ts).
// Por que testar: ela decide se o servidor sobe ou não em produção, e quais avisos o dono recebe.
// Cada teste simula um "ambiente" diferente passando um objeto de variáveis (sem tocar no real).
// ============================================================================

import { describe, expect, it } from "vitest";
import { checkEnv, WHATSAPP_EXEMPLO } from "@/server/env";

// Um número de WhatsApp "real" (de mentira, mas diferente do de exemplo) e um segredo longo o bastante.
const REAL = "5511999999999";
const SEGREDO = "x".repeat(40);

// Um ambiente de produção completo e correto, sobre o qual cada teste muda um detalhe.
const completo = {
  NODE_ENV: "production",
  DATABASE_URL: "postgres://x",
  ADMIN_PASSWORD: "uma-senha-bem-longa-123",
  ADMIN_SESSION_SECRET: SEGREDO,
  CRON_SECRET: "cron",
  SITE_URL: "https://exemplo.com.br",
};

describe("checkEnv", () => {
  // O caso ideal: tudo configurado, nenhum aviso.
  it("ambiente de produção completo não tem erro nem aviso", () => {
    expect(checkEnv(completo, REAL)).toEqual({ errors: [], warnings: [] });
  });

  // No computador do desenvolvedor, sem nada configurado, só deve avisar que o painel está desligado.
  it("desenvolvimento sem nada configurado só avisa do painel", () => {
    const r = checkEnv({ NODE_ENV: "development" }, WHATSAPP_EXEMPLO);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatch(/painel/);
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

  // Configurar só a senha (ou só o segredo) quase sempre é esquecimento: é erro, e não "painel desligado".
  it("painel pela metade é erro: só a senha, só o segredo ou segredo curto", () => {
    expect(checkEnv({ ...completo, ADMIN_SESSION_SECRET: undefined }, REAL).errors.join(" ")).toMatch(/ADMIN_SESSION_SECRET/);
    expect(checkEnv({ ...completo, ADMIN_PASSWORD: undefined }, REAL).errors.join(" ")).toMatch(/ADMIN_PASSWORD/);
    expect(checkEnv({ ...completo, ADMIN_SESSION_SECRET: "curto" }, REAL).errors.join(" ")).toMatch(/32 caracteres/);
  });

  it("avisa de senha curta em produção", () => {
    const r = checkEnv({ ...completo, ADMIN_PASSWORD: "curta" }, REAL);
    expect(r.errors).toEqual([]);
    expect(r.warnings.join(" ")).toMatch(/12 caracteres/);
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
