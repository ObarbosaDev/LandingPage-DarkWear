// ============================================================================
// Preparação que roda ANTES de cada arquivo de teste (configurada em vitest.config.mts).
// ============================================================================

// Ambiente dos testes: banco Postgres em memória (PGlite) e um painel configurado com valores falsos.
// Cada arquivo de teste roda em um processo próprio, então cada um tem o seu banco.

// Garante que nenhum teste fale com um banco ou ambiente reais, mesmo que a máquina tenha essas
// variáveis configuradas.
delete process.env.DATABASE_URL;
delete process.env.VERCEL;
// "memory://" = banco só na memória: nada é gravado em disco e some ao fim do teste.
process.env.PGLITE_DIR = "memory://";
// Senha e segredo FALSOS, só para testar o login do painel. Não têm relação com os valores reais.
process.env.ADMIN_PASSWORD = "senha-de-teste";
process.env.ADMIN_SESSION_SECRET = "segredo-de-teste-com-mais-de-32-caracteres";
// Mercado Pago: nunca herdar credenciais reais da máquina. Cada teste de pagamento define as suas (falsas).
delete process.env.MERCADOPAGO_ACCESS_TOKEN;
delete process.env.MERCADOPAGO_WEBHOOK_SECRET;
delete process.env.MERCADOPAGO_SANDBOX;
delete process.env.MERCADOPAGO_MAX_INSTALLMENTS;
delete process.env.SITE_URL;
