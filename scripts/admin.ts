// ============================================================================
// Comandos para ADMINISTRADORES da loja (rodar no terminal, fora do site):
//
//   npm run admin:criar -- --email maria@loja.com --nome "Maria Souza" --celular 11987654321
//   npm run admin:senha -- --email maria@loja.com        (esqueceu a senha: gera outra provisória)
//   npm run admin:remover -- --email maria@loja.com      (tira o acesso ao painel)
//   npm run admin:listar                                 (quem administra hoje)
//
// POR QUE EXISTE: o painel não tem senha própria. Quem administra é uma conta com papel "admin", e este é o
// ÚNICO jeito de conceder o papel: nenhum formulário ou tela do site faz isso. Quem roda este comando é quem
// tem acesso ao servidor ou ao banco (o dono).
//
// COMO ENTREGAR O ACESSO: rode "admin:criar", copie o e-mail e a SENHA PROVISÓRIA (aparece uma única vez) e
// passe à pessoa. Ela entra pela tela de entrar do próprio site, como qualquer cliente, e é obrigada a trocar
// a senha no primeiro acesso. Não há botão de admin no site.
//
// Para qual banco: se DATABASE_URL existir, o banco de PRODUÇÃO (Neon); senão, o banco local embutido. As
// variáveis são lidas do .env.local, se ele existir. O "--conditions=react-server" (no package.json) deixa
// este script usar o código do servidor do site.
// ============================================================================

import { existsSync } from "node:fs";

/** Lê "--chave valor" dos argumentos. Chave sem valor vira "". */
function lerArgumentos(args: string[]): Record<string, string> {
  const r: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith("--")) continue;
    const proximo = args[i + 1];
    r[args[i].slice(2)] = proximo !== undefined && !proximo.startsWith("--") ? proximo : "";
    if (r[args[i].slice(2)] !== "") i++;
  }
  return r;
}

const AJUDA = `Uso:
  npm run admin:criar -- --email EMAIL --nome "NOME" --celular DDDNUMERO   cria (ou promove) um administrador
  npm run admin:senha -- --email EMAIL                                      gera outra senha provisória
  npm run admin:remover -- --email EMAIL                                    tira o acesso ao painel
  npm run admin:listar                                                      lista os administradores`;

async function main() {
  // Lê o .env.local (se existir) para pegar DATABASE_URL, como o servidor faz.
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");

  const [comando, ...resto] = process.argv.slice(2);
  const a = lerArgumentos(resto);
  if (!comando || !["criar", "senha", "remover", "listar"].includes(comando)) {
    console.error(AJUDA);
    process.exitCode = 1;
    return;
  }

  // Só agora carrega o código do servidor (precisa das variáveis de ambiente já lidas).
  const { createAdministrator, listAdministrators, removeAdministrator, resetAdministratorPassword } = await import("../src/server/admin/administrators");

  const destino = process.env.DATABASE_URL ? "banco de PRODUÇÃO (DATABASE_URL)" : "banco local (.data)";
  console.log(`Banco: ${destino}\n`);
  if (!process.env.DATABASE_URL) console.warn("Atenção: pare o servidor de desenvolvimento antes (dois processos no mesmo banco embutido podem corromper os dados).\n");

  const site = (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");

  if (comando === "criar") {
    if (!a.email) throw new Error("Informe --email.");
    const r = await createAdministrator({ email: a.email, nome: a.nome, celular: a.celular });
    console.log(r.criado ? `Administrador criado: ${r.email}` : `Conta existente promovida a administrador: ${r.email}`);
    mostrarSenha(r.senhaProvisoria, site);
  } else if (comando === "senha") {
    if (!a.email) throw new Error("Informe --email.");
    const r = await resetAdministratorPassword(a.email);
    console.log(`Nova senha provisória para ${a.email}.`);
    mostrarSenha(r.senhaProvisoria, site);
  } else if (comando === "remover") {
    if (!a.email) throw new Error("Informe --email.");
    const r = await removeAdministrator(a.email);
    if (r === "removido") console.log(`${a.email} não é mais administrador (a conta continua como cliente comum e as sessões abertas foram encerradas).`);
    else if (r === "nao-era-admin") console.log(`${a.email} já não era administrador. Nada foi alterado.`);
    else throw new Error(`Conta não encontrada: ${a.email}`);
    // Aviso útil: sem administradores, o painel fica fechado para todos.
    if ((await listAdministrators()).length === 0) console.warn("\nAtenção: agora não há nenhum administrador. O painel está fechado até você criar um (npm run admin:criar).");
  } else {
    const lista = await listAdministrators();
    if (lista.length === 0) console.log("Nenhum administrador. O painel está fechado. Crie um com: npm run admin:criar");
    for (const adm of lista) console.log(`  ${adm.email.padEnd(36)} ${adm.name}${adm.mustChangePassword ? "   (ainda não trocou a senha provisória)" : ""}`);
  }
}

/** Mostra a senha provisória UMA vez, com as instruções para quem vai receber o acesso. */
function mostrarSenha(senha: string, site: string) {
  console.log(`\n  Senha provisória: ${senha}\n`);
  console.log("Esta senha aparece só agora e não fica guardada em lugar nenhum (só o hash dela).");
  console.log(`Passe o e-mail e a senha à pessoa. Ela entra em ${site}/conta/entrar e será obrigada a trocá-la no primeiro acesso.`);
}

main()
  .catch((e) => {
    console.error(`\nErro: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  })
  // O banco mantém conexões abertas: encerra o processo para o comando terminar.
  .finally(() => process.exit(process.exitCode ?? 0));
