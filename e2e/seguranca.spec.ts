// ============================================================================
// ROTEIRO PONTA A PONTA: as portas que têm de ficar fechadas, vistas de fora, como um visitante qualquer.
//   - o painel não existe para quem não é administrador (404 de verdade, sem pista de que há um painel);
//   - não há botão nem link de "admin" nas telas públicas;
//   - a prévia da sacola e o download de dados exigem conta;
//   - cliente comum logado também não enxerga o painel.
// ============================================================================

import { expect, test } from "@playwright/test";

test("o painel é um 404 de verdade para quem não é administrador", async ({ page }) => {
  for (const caminho of ["/admin", "/admin/pedidos", "/admin/cupons", "/admin/diario", "/admin/produtos"]) {
    const resposta = await page.goto(caminho);
    expect(resposta?.status(), caminho).toBe(404);
    // Nenhuma palavra do painel vaza na página de "não encontrado".
    const html = await page.content();
    expect(html, caminho).not.toMatch(/Bastidores|Esteira|Prateleira|Caderneta/);
  }
});

test("as telas públicas não têm botão nem link para o painel", async ({ page }) => {
  for (const caminho of ["/", "/loja", "/conta/entrar", "/sobre", "/contato"]) {
    await page.goto(caminho);
    const links = await page.locator("a[href]").evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""));
    expect(links.filter((h) => h.startsWith("/admin")), caminho).toEqual([]);
    await expect(page.getByRole("button", { name: /admin/i }), caminho).toHaveCount(0);
  }
});

test("prévia da sacola e baixar dados exigem conta", async ({ request }) => {
  const previa = await request.post("/api/cart/preview", { data: { items: [{ slug: "oversized-gt3-rs", size: "M", color: "Preta", qty: 1 }], coupon: "E2E10" } });
  expect(previa.status()).toBe(401);
  expect((await request.get("/api/conta/dados")).status()).toBe(401);
  const pedido = await request.post("/api/orders", { data: { items: [{ slug: "oversized-gt3-rs", size: "M", color: "Preta", qty: 1 }] } });
  expect(pedido.status()).toBe(401);
});

test("um cliente comum logado também recebe 404 no painel", async ({ page }) => {
  const email = `comum-${Date.now()}@e2e.local`;
  await page.goto("/conta/cadastro");
  await page.getByLabel("Nome").fill("Comum E2E");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel(/Celular/).fill("11987654322");
  await page.getByLabel(/^Senha/).fill("senha de teste forte 123");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Costurar minha conta" }).click();
  await expect(page).toHaveURL(new RegExp("/conta$|/carrinho$"));
  const resposta = await page.goto("/admin/pedidos");
  expect(resposta?.status()).toBe(404);
});
