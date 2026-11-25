// ============================================================================
// Prepara o banco DESCARTÁVEL dos testes ponta a ponta (chamado pelo playwright.config.ts antes de subir o site).
//
// Apaga a pasta do banco de teste (.data/e2e), cria o banco do zero e deixa nele:
//   - um cupom de teste (E2E10: 10% de desconto);
//   - um administrador de teste (adm@e2e.local) com senha conhecida, sem troca obrigatória;
//   - estoque de sobra nas peças de exemplo.
// SEGURANÇA: se DATABASE_URL existir, recusa (nunca mexe em banco de verdade). Só apaga a pasta apontada por PGLITE_DIR,
// e só se ela ficar dentro de .data/.
// ============================================================================

import { rmSync } from "node:fs";
import path from "node:path";

/** A senha do administrador de teste (só existe no banco descartável dos testes). */
export const SENHA_E2E = "senha de teste forte 123";

async function main() {
  if (process.env.DATABASE_URL) throw new Error("Recusado: DATABASE_URL está definida. Os testes ponta a ponta só usam o banco local descartável.");
  const dir = process.env.PGLITE_DIR ?? ".data/e2e";
  const absoluto = path.resolve(dir);
  if (!absoluto.startsWith(path.resolve(".data") + path.sep)) throw new Error("Recusado: o banco dos testes precisa ficar dentro de .data/.");
  rmSync(absoluto, { recursive: true, force: true });
  process.env.PGLITE_DIR = dir;
  process.env.CUSTOMER_SESSION_SECRET ??= "segredo-de-teste-ponta-a-ponta-com-mais-de-32-caracteres";

  const { getDb } = await import("../src/server/db");
  const { customers, productStock } = await import("../src/server/db/schema");
  const { eq } = await import("drizzle-orm");
  const { createAdministrator } = await import("../src/server/admin/administrators");
  const { hashPassword } = await import("../src/server/customers/password");
  const { createCoupon } = await import("../src/server/coupons");

  const db = await getDb();
  await db.update(productStock).set({ stock: 200 });
  await createCoupon({ code: "E2E10", kind: "percent", value: 10, minOrderCents: 0, maxUses: null, startsAt: null, expiresAt: null, active: true });
  await createAdministrator({ email: "adm@e2e.local", nome: "Admin E2E", celular: "11999990000" });
  await db.update(customers).set({ passwordHash: await hashPassword(SENHA_E2E), mustChangePassword: false }).where(eq(customers.email, "adm@e2e.local"));
  console.log("Banco dos testes ponta a ponta pronto.");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
