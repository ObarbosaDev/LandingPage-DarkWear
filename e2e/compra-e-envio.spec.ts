// ============================================================================
// ROTEIRO PONTA A PONTA: a jornada inteira de uma compra, do clique à entrega, num navegador de verdade.
//
//   1. a cliente escolhe a peça, o tamanho e a cor, e coloca na sacola;
//   2. tenta fechar sem conta: é levada a entrar; cria a conta e cadastra o endereço;
//   3. volta à sacola, aplica um cupom (prévia do servidor) e fecha o pedido pelo WhatsApp;
//   4. o dono (administrador) entra pela MESMA tela de entrar, vê o pedido na esteira, marca como pago e enviado com rastreio;
//   5. a cliente vê o andamento e o código de rastreio na página do pedido.
// O WhatsApp (wa.me) é interceptado: nenhuma mensagem sai do computador.
// Tudo usa dados de teste do banco descartável (ver playwright.config.ts).
// ============================================================================

import { expect, test } from "@playwright/test";

const SENHA = "senha de teste forte 123";
const EMAIL = `cliente-${Date.now()}@e2e.local`;
const SENHA_ADMIN = "senha de teste forte 123";

test("compra com cupom, e o dono leva o pedido até o envio com rastreio", async ({ browser }) => {
  // Duas pessoas, dois navegadores independentes (cookies separados): a cliente e o dono.
  const cliente = await (await browser.newContext()).newPage();
  const dono = await (await browser.newContext()).newPage();
  // Nada sai para o WhatsApp de verdade.
  await cliente.route("https://wa.me/**", (rota) => rota.fulfill({ status: 200, contentType: "text/html", body: "<title>wa</title>" }));

  // ---- 1. escolhe a peça ----
  await cliente.goto("/loja/oversized-gt3-rs");
  await cliente.getByRole("button", { name: "M", exact: true }).click();
  await cliente.getByRole("button", { name: "Adicionar à sacola" }).click();
  await cliente.getByRole("link", { name: /Ir para a sacola/ }).click();
  await expect(cliente.getByRole("heading", { name: /sacola/i })).toBeVisible();

  // ---- 2. sem conta: é levada a entrar; cria a conta ----
  await cliente.getByRole("button", { name: "Finalizar pelo WhatsApp" }).click();
  await expect(cliente).toHaveURL(/\/conta\/entrar/);
  await cliente.getByRole("link", { name: "Criar a minha" }).click();
  await cliente.getByLabel("Nome").fill("Cliente E2E");
  await cliente.getByLabel("E-mail").fill(EMAIL);
  await cliente.getByLabel(/Celular/).fill("11987654321");
  await cliente.getByLabel(/^Senha/).fill(SENHA);
  await cliente.getByRole("checkbox").check();
  await cliente.getByRole("button", { name: "Costurar minha conta" }).click();
  await expect(cliente).toHaveURL(new RegExp("/carrinho$"));

  // ---- 3. sem endereço, a sacola leva ao cadastro do endereço ----
  await cliente.goto("/carrinho");
  await cliente.getByRole("button", { name: "Finalizar pelo WhatsApp" }).click();
  await expect(cliente).toHaveURL(/\/conta.*endereco/);
  // O CEP é consultado no ViaCEP (serviço externo): no teste o endereço é preenchido à mão, o que também prova o plano B.
  await cliente.locator("#cep").fill("01310100");
  await cliente.locator("#street").fill("Avenida Paulista");
  await cliente.locator("#number").fill("1000");
  await cliente.locator("#district").fill("Bela Vista");
  await cliente.locator("#city").fill("São Paulo");
  await cliente.locator("#state").selectOption("SP");
  await cliente.getByRole("button", { name: /Salvar/ }).first().click();
  await expect(cliente.getByText(/Avenida Paulista/).first()).toBeVisible();

  // ---- 4. volta à sacola, aplica o cupom e fecha ----
  await cliente.goto("/carrinho");
  await cliente.getByLabel("Cupom de desconto").fill("e2e10");
  await cliente.getByRole("button", { name: "Aplicar" }).click();
  await expect(cliente.getByText(/Cupom E2E10 aplicado/)).toBeVisible();
  // R$ 89,90 com 10% = R$ 80,91 (10% arredondado para baixo: R$ 8,99 de desconto).
  await expect(cliente.getByText(/R\$\s?80,91/).first()).toBeVisible();
  await cliente.getByRole("button", { name: "Finalizar pelo WhatsApp" }).click();
  await cliente.waitForURL(/wa\.me/);
  const texto = decodeURIComponent(new URL(cliente.url()).searchParams.get("text") ?? "");
  expect(texto).toMatch(/Cupom E2E10/);
  expect(texto).toMatch(/Total: R\$\s?80,91/);
  const numero = /Pedido (DW-\d{5})/.exec(texto)![1];

  // ---- 5. o dono entra pela tela de todo mundo e leva o pedido até o envio ----
  await dono.goto("/conta/entrar");
  await dono.locator("#email").fill("adm@e2e.local");
  await dono.locator("#password").fill(SENHA_ADMIN);
  await dono.getByRole("button", { name: "Entrar" }).click();
  await expect(dono).toHaveURL(/\/admin/);
  await dono.goto("/admin/pedidos");
  const ordem = dono.locator("article", { hasText: numero });
  await expect(ordem).toBeVisible();
  await ordem.getByRole("button", { name: /Marcar como pago/ }).click();
  await expect(dono.locator("article", { hasText: numero }).getByRole("button", { name: /Marcar como enviado/ })).toBeVisible();
  await dono.locator("article", { hasText: numero }).getByLabel(/Código de rastreio/).first().fill("ab 123456789 br");
  await dono.locator("article", { hasText: numero }).getByRole("button", { name: /Marcar como enviado/ }).click();
  await expect(dono.locator("article", { hasText: numero }).getByText(/AB123456789BR/).first()).toBeVisible();

  // O diário do painel anotou quem fez.
  await dono.goto("/admin/diario");
  await expect(dono.getByText(new RegExp(`adm mudou o pedido ${numero}`)).first()).toBeVisible();

  // ---- 6. a cliente vê o andamento e o rastreio ----
  await cliente.goto(`/conta/pedidos/${numero}`);
  await expect(cliente.getByRole("heading", { name: "Enviado" })).toBeVisible();
  await expect(cliente.getByRole("link", { name: "AB123456789BR" })).toHaveAttribute("href", /rastreamento\.correios\.com\.br.*AB123456789BR/);
  await expect(cliente.getByText(/Cupom E2E10/)).toBeVisible();
});
