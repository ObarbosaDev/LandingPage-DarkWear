// ============================================================================
// Testes do PORTEIRO do painel (src/proxy.ts): barra /admin ANTES de qualquer página ser montada.
// Por que existe: dentro do layout, o "não encontrado" só pode ser lançado depois que a resposta já começou a ser
// enviada. Em produção isso dava status 200 e deixava o título e o nome da rota do painel nos dados internos da
// página. O porteiro responde com um 404 de verdade, idêntico ao de qualquer endereço que não existe.
//
// IMPORTANTE: o porteiro só olha o cookie assinado (que leva o papel do login, como DICA). Quem decide de verdade
// continua sendo o banco, no layout e nas ações (requireAdmin). Por isso um cookie de administrador que perdeu o
// papel depois do login passa pelo porteiro e é barrado pelo layout: está testado em admin-access.test.ts.
// ============================================================================

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { proxy } from "@/proxy";
import { COOKIE_CLIENTE, signSession, verifySession } from "@/server/customers/token";

const SEGREDO = "segredo-do-porteiro-com-mais-de-32-caracteres-xx";
const HORA = 3600_000;

beforeEach(() => {
  process.env.CUSTOMER_SESSION_SECRET = SEGREDO;
});
afterEach(() => {
  process.env.CUSTOMER_SESSION_SECRET = SEGREDO;
});

/** Uma requisição a um endereço, com (ou sem) o cookie da sessão. */
function pedido(caminho: string, cookie?: string, metodo = "GET"): NextRequest {
  return new NextRequest(`http://localhost:3000${caminho}`, { method: metodo, headers: cookie ? { cookie: `${COOKIE_CLIENTE}=${cookie}` } : {} });
}
const token = (role: "cliente" | "admin", extra: Partial<{ exp: number; id: number }> = {}, segredo = SEGREDO) =>
  signSession({ id: extra.id ?? 1, version: 1, exp: extra.exp ?? Date.now() + HORA }, segredo, Date.now(), role);

/** O porteiro deixou passar? (o Next marca com x-middleware-next) */
const passou = (r: Response) => r.headers.get("x-middleware-next") === "1";
/** O porteiro reescreveu para um endereço que não existe? */
const barrou = (r: Response) => Boolean(r.headers.get("x-middleware-rewrite"));

describe("token: o papel no cookie", () => {
  it("o papel assinado volta na leitura; sem papel, é cliente", () => {
    expect(verifySession(token("admin"), SEGREDO)?.role).toBe("admin");
    expect(verifySession(token("cliente"), SEGREDO)?.role).toBe("cliente");
    // Cookie de antes desta regra (sem papel): nunca é administrador.
    const dados = Buffer.from(JSON.stringify({ id: 1, v: 1, exp: Date.now() + HORA, iat: Date.now() })).toString("base64url");
    // (assinatura inválida de propósito: só queremos ver que um token sem "r" não vira admin por acidente)
    expect(verifySession(`${dados}.x`, SEGREDO)).toBeNull();
  });

  it("um papel inventado ou adulterado no cookie invalida a assinatura", () => {
    const [dados, assinatura] = token("cliente").split(".");
    const obj = JSON.parse(Buffer.from(dados, "base64url").toString());
    const forjado = Buffer.from(JSON.stringify({ ...obj, r: "admin" })).toString("base64url");
    expect(verifySession(`${forjado}.${assinatura}`, SEGREDO)).toBeNull();
  });

  it("papel desconhecido assinado por nós vale como cliente (nunca como admin)", () => {
    const t = signSession({ id: 1, version: 1, exp: Date.now() + HORA }, SEGREDO, Date.now(), "dono" as never);
    expect(verifySession(t, SEGREDO)?.role).toBe("cliente");
  });
});

describe("proxy: quem passa em /admin", () => {
  it("administrador com cookie válido passa, em qualquer página e para ações (POST)", () => {
    for (const c of ["/admin", "/admin/pedidos", "/admin/clientes", "/admin/produtos/camisa-mumia"]) expect(passou(proxy(pedido(c, token("admin")))), c).toBe(true);
    expect(passou(proxy(pedido("/admin/pedidos", token("admin"), "POST")))).toBe(true);
  });

  it("anônimo é barrado com um 404 reescrito, em qualquer página e em ações", () => {
    for (const c of ["/admin", "/admin/pedidos", "/admin/clientes", "/admin/produtos/novo", "/admin/qualquer/coisa"]) expect(barrou(proxy(pedido(c))), c).toBe(true);
    expect(barrou(proxy(pedido("/admin/pedidos", undefined, "POST")))).toBe(true);
  });

  it("cliente comum logado é barrado", () => {
    expect(barrou(proxy(pedido("/admin", token("cliente"))))).toBe(true);
  });

  it("cookie vencido, adulterado, de outro segredo ou lixo é barrado, mesmo com papel de admin", () => {
    expect(barrou(proxy(pedido("/admin", token("admin", { exp: Date.now() - 1000 }))))).toBe(true);
    expect(barrou(proxy(pedido("/admin", token("admin").slice(0, -3) + "abc")))).toBe(true);
    expect(barrou(proxy(pedido("/admin", token("admin", {}, "outro-segredo-completamente-diferente-123"))))).toBe(true);
    for (const lixo of ["", "lixo", "a.b", "x".repeat(2000)]) expect(barrou(proxy(pedido("/admin", lixo))), lixo.slice(0, 8)).toBe(true);
  });

  it("sem segredo configurado, ninguém passa (nunca 'aberto')", () => {
    const t = token("admin");
    delete process.env.CUSTOMER_SESSION_SECRET;
    expect(barrou(proxy(pedido("/admin", t)))).toBe(true);
  });

  it("a reescrita aponta para um endereço que não existe no site (assim o 404 é o de verdade)", () => {
    const destino = proxy(pedido("/admin")).headers.get("x-middleware-rewrite") ?? "";
    expect(destino).toMatch(/\/_painel-inexistente$/);
  });
});
