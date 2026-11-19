// Ambiente dos testes: banco Postgres em memória (PGlite) e um painel configurado com valores falsos.
// Cada arquivo de teste roda em um processo próprio, então cada um tem o seu banco.

delete process.env.DATABASE_URL;
delete process.env.VERCEL;
process.env.PGLITE_DIR = "memory://";
process.env.ADMIN_PASSWORD = "senha-de-teste";
process.env.ADMIN_SESSION_SECRET = "segredo-de-teste-com-mais-de-32-caracteres";
