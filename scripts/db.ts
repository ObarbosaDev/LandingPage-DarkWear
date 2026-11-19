// ============================================================================
// Comandos do banco de dados (rodar no terminal, fora do servidor):
//
//   npm run db:status              mostra quais migrações estão aplicadas e quais estão pendentes
//   npm run db:migrate             aplica as migrações pendentes (as SUBIDAS)
//   npm run db:rollback            desfaz a última migração (uma DESCIDA) — pede confirmação
//   npm run db:rollback -- 2       desfaz as 2 últimas
//
// Para qual banco: se DATABASE_URL existir, o banco da Neon (produção); senão, o banco local
// embutido em .data/pglite. As variáveis são lidas do .env.local, se ele existir.
//
// Quando usar o db:migrate: em produção com DB_AUTO_MIGRATE=false, rode-o ANTES de publicar uma
// versão nova do site, para o servidor nunca precisar alterar o banco sozinho.
// ============================================================================

import { existsSync, mkdirSync } from "node:fs";
import {
  MIGRATIONS,
  migrationStatus,
  rollbackMigrations,
  runMigrations,
  type SqlRunner,
} from "../src/server/db/migrations";

/** Quem executa a conexão e a função para encerrá-la. */
type Conexao = { runner: SqlRunner; fechar: () => Promise<void>; descricao: string };

/**
 * Abre UMA conexão com o banco certo (as migrações precisam de uma conexão só, por causa da
 * transação e da trava) e devolve também como descrevê-la ao usuário.
 */
async function conectar(): Promise<Conexao> {
  const url = process.env.DATABASE_URL;

  if (url) {
    // Produção: Postgres da Neon.
    const { Pool } = await import("@neondatabase/serverless");
    const pool = new Pool({ connectionString: url });
    const conn = await pool.connect();
    return {
      runner: { exec: (sql) => conn.query(sql), query: (sql, params) => conn.query(sql, params) },
      fechar: async () => {
        conn.release();
        await pool.end();
      },
      descricao: "banco de PRODUÇÃO (DATABASE_URL)",
    };
  }

  // Local: o banco embutido. Dois processos no mesmo diretório podem corromper os dados, por isso o aviso.
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = process.env.PGLITE_DIR ?? "./.data/pglite";
  if (!dir.startsWith("memory://")) mkdirSync(dir, { recursive: true });
  console.warn("Atenção: este comando abre o banco local diretamente. Pare o servidor de desenvolvimento antes (dois processos no mesmo banco podem corromper os dados).\n");
  const client = new PGlite(dir);
  return {
    runner: { exec: (sql) => client.exec(sql), query: (sql, params) => client.query(sql, params) },
    fechar: () => client.close(),
    descricao: `banco local (${dir})`,
  };
}

/** Formata uma data no padrão brasileiro, ou um traço se não houver. */
const data = (d: Date | null) =>
  d ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(d) : "—";

/** Imprime a tabela de situação das migrações. */
async function mostrarStatus(runner: SqlRunner) {
  const estado = await migrationStatus(runner, MIGRATIONS);
  for (const e of estado) {
    const situacao = e.alterada ? "ALTERADA!" : e.aplicada ? "aplicada" : "pendente";
    const rev = e.reversivel ? "reversível" : "irreversível";
    console.log(`  ${e.id.padEnd(30)} ${situacao.padEnd(10)} ${data(e.aplicadaEm).padEnd(18)} ${rev}`);
  }
  const pendentes = estado.filter((e) => !e.aplicada).length;
  console.log(`\n${pendentes === 0 ? "O banco está em dia." : `Faltam ${pendentes} migração(ões). Rode: npm run db:migrate`}`);
}

async function main() {
  // Lê o .env.local (se existir) para pegar DATABASE_URL e PGLITE_DIR, como o servidor faz.
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");

  const [comando = "status", ...resto] = process.argv.slice(2);
  const conexao = await conectar();
  console.log(`Banco: ${conexao.descricao}\n`);

  try {
    if (comando === "status") {
      await mostrarStatus(conexao.runner);
    } else if (comando === "migrate") {
      const feitas = await runMigrations(conexao.runner, MIGRATIONS);
      console.log(feitas.length ? `Aplicadas: ${feitas.join(", ")}` : "Nada a aplicar: o banco já estava em dia.");
    } else if (comando === "rollback") {
      const confirmar = resto.includes("--confirm");
      const passos = Number(resto.find((a) => /^\d+$/.test(a)) ?? 1);
      if (!confirmar) {
        // Desfazer pode apagar dados: mostra o que seria desfeito e exige a confirmação explícita.
        const aplicadas = (await migrationStatus(conexao.runner, MIGRATIONS)).filter((e) => e.aplicada).reverse().slice(0, passos);
        console.log(`Isto DESFARIA: ${aplicadas.map((e) => e.id).join(", ") || "(nada aplicado)"}`);
        console.log("Desfazer pode apagar dados. Para confirmar, rode de novo com --confirm:");
        console.log(`  npm run db:rollback -- ${passos} --confirm`);
        process.exitCode = 1;
      } else {
        const desfeitas = await rollbackMigrations(conexao.runner, passos, MIGRATIONS);
        console.log(desfeitas.length ? `Desfeitas: ${desfeitas.join(", ")}` : "Nada a desfazer.");
      }
    } else {
      console.error(`Comando desconhecido: "${comando}". Use: status, migrate ou rollback.`);
      process.exitCode = 1;
    }
  } finally {
    await conexao.fechar();
  }
}

main().catch((e) => {
  console.error(`\nErro: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
