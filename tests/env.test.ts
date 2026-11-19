import { describe, expect, it } from "vitest";
import { checkEnv, WHATSAPP_EXEMPLO } from "@/server/env";

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
  it("ambiente de produção completo não tem erro nem aviso", () => {
    expect(checkEnv(completo, REAL)).toEqual({ errors: [], warnings: [] });
  });

  it("desenvolvimento sem nada configurado só avisa do painel", () => {
    const r = checkEnv({ NODE_ENV: "development" }, WHATSAPP_EXEMPLO);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatch(/painel/);
  });

  it("na Vercel, sem DATABASE_URL é erro", () => {
    const r = checkEnv({ ...completo, VERCEL: "1", DATABASE_URL: undefined }, REAL);
    expect(r.errors.join(" ")).toMatch(/DATABASE_URL/);
  });

  it("fora da Vercel, produção sem DATABASE_URL é só aviso", () => {
    const r = checkEnv({ ...completo, DATABASE_URL: undefined }, REAL);
    expect(r.errors).toEqual([]);
    expect(r.warnings.join(" ")).toMatch(/banco local/);
  });

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
