// ============================================================================
// Testes de ADMINISTRADORES (src/server/admin/administrators.ts): o núcleo dos comandos "npm run
// admin:criar", "admin:remover", "admin:senha" e "admin:listar".
// Por que testar: este é o ÚNICO caminho que concede o papel de administrador. Se ele errar, ou alguém ganha
// o painel sem merecer, ou o dono fica trancado para fora da própria loja.
// ============================================================================

import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import { customers } from "@/server/db/schema";
import { anonymizeCustomer, authenticate, getCustomer, parseRegisterForm, registerCustomer } from "@/server/customers";
import { createAdministrator, listAdministrators, removeAdministrator, resetAdministratorPassword } from "@/server/admin/administrators";
import { resetDb } from "./helpers/db";

beforeEach(resetDb);

const SENHA = "minha senha forte 123";

async function criarCliente(email: string, nome = "Cliente Comum"): Promise<number> {
  const f = new FormData();
  for (const [k, v] of Object.entries({ name: nome, email, phone: "11987654321", password: SENHA, privacy: "on" })) f.set(k, v);
  const p = parseRegisterForm(f);
  if (!p.ok) throw new Error(p.error);
  const r = await registerCustomer(p.data);
  if (!r.ok) throw new Error(r.error);
  return r.id;
}

const linha = async (id: number) => (await (await getDb()).select().from(customers).where(eq(customers.id, id)))[0];

describe("createAdministrator", () => {
  it("cria uma conta nova de administrador com senha provisória que obriga a troca", async () => {
    const r = await createAdministrator({ email: "  Dono@Loja.com ", nome: "Maria Dona", celular: "(11) 98765-4321" });
    expect(r).toMatchObject({ email: "dono@loja.com", criado: true });
    expect(r.senhaProvisoria).toMatch(/^[A-Za-z0-9]{16}$/);

    const c = await linha(r.id);
    expect(c).toMatchObject({ name: "Maria Dona", email: "dono@loja.com", phone: "11987654321", role: "admin", mustChangePassword: true });
    expect(c.privacyAcceptedAt).toBeInstanceOf(Date);
    // A senha provisória entra uma vez, e só o hash fica no banco.
    expect(await authenticate("dono@loja.com", r.senhaProvisoria)).toMatchObject({ id: r.id, role: "admin", mustChangePassword: true });
    expect(c.passwordHash).not.toContain(r.senhaProvisoria);
  });

  it("promove uma conta que já existe: mantém nome e celular, troca a senha e derruba as sessões", async () => {
    const id = await criarCliente("ana@exemplo.com", "Ana Souza");
    const r = await createAdministrator({ email: "ana@exemplo.com" });
    expect(r).toMatchObject({ id, criado: false });
    const c = await linha(id);
    expect(c).toMatchObject({ name: "Ana Souza", phone: "11987654321", role: "admin", mustChangePassword: true });
    expect(c.sessionVersion).toBe(2); // cookies antigos caem
    expect(await authenticate("ana@exemplo.com", SENHA)).toBeNull(); // a senha antiga deixa de valer
    expect(await authenticate("ana@exemplo.com", r.senhaProvisoria)).toMatchObject({ id });
  });

  it("repetir o comando para quem já é administrador só gera uma senha provisória nova", async () => {
    const a = await createAdministrator({ email: "dono@loja.com", nome: "Dono", celular: "11987654321" });
    const b = await createAdministrator({ email: "dono@loja.com" });
    expect(b).toMatchObject({ id: a.id, criado: false });
    expect(b.senhaProvisoria).not.toBe(a.senhaProvisoria);
    expect(await authenticate("dono@loja.com", a.senhaProvisoria)).toBeNull();
  });

  it("conta nova exige nome e celular válidos; e-mail inválido é recusado", async () => {
    await expect(createAdministrator({ email: "novo@loja.com" })).rejects.toThrow(/nome/i);
    await expect(createAdministrator({ email: "novo@loja.com", nome: "A" })).rejects.toThrow(/nome/i);
    await expect(createAdministrator({ email: "novo@loja.com", nome: "Novo Admin" })).rejects.toThrow(/celular/i);
    await expect(createAdministrator({ email: "novo@loja.com", nome: "Novo Admin", celular: "123" })).rejects.toThrow(/celular/i);
    for (const email of ["", "semarroba", "a@b", "a b@c.com", "josé@exemplo.com"]) {
      await expect(createAdministrator({ email, nome: "Novo Admin", celular: "11987654321" }), email).rejects.toThrow(/e-mail/i);
    }
    expect(await (await getDb()).select().from(customers)).toHaveLength(0);
  });

  it("e-mail de uma conta excluída (anonimizada) vira uma conta nova, sem ressuscitar a antiga", async () => {
    const velho = await criarCliente("ex@exemplo.com");
    await anonymizeCustomer(velho);
    const r = await createAdministrator({ email: "ex@exemplo.com", nome: "Novo Dono", celular: "11987654321" });
    expect(r.criado).toBe(true);
    expect(r.id).not.toBe(velho);
    expect((await linha(velho)).role).toBe("cliente");
  });
});

describe("removeAdministrator", () => {
  it("volta o administrador a cliente comum e derruba as sessões", async () => {
    const r = await createAdministrator({ email: "dono@loja.com", nome: "Dono", celular: "11987654321" });
    expect(await removeAdministrator(" DONO@loja.com ")).toBe("removido");
    const c = await linha(r.id);
    expect(c.role).toBe("cliente");
    expect(c.sessionVersion).toBe(2);
    expect(c.anonymizedAt).toBeNull(); // a conta continua existindo, só perde o papel
  });

  it("avisa quando a conta não era administradora ou não existe, sem mudar nada", async () => {
    const id = await criarCliente("c@exemplo.com");
    expect(await removeAdministrator("c@exemplo.com")).toBe("nao-era-admin");
    expect(await removeAdministrator("ninguem@exemplo.com")).toBe("nao-encontrado");
    expect((await linha(id)).sessionVersion).toBe(1);
  });
});

describe("resetAdministratorPassword", () => {
  it("gera senha provisória nova para um administrador", async () => {
    const a = await createAdministrator({ email: "dono@loja.com", nome: "Dono", celular: "11987654321" });
    const r = await resetAdministratorPassword("dono@loja.com");
    expect(r.senhaProvisoria).not.toBe(a.senhaProvisoria);
    expect(await authenticate("dono@loja.com", r.senhaProvisoria)).toMatchObject({ role: "admin", mustChangePassword: true });
  });

  // O comando de redefinir NUNCA pode servir para promover alguém: só quem já é administrador.
  it("recusa conta que não é administradora e não a promove", async () => {
    const id = await criarCliente("c@exemplo.com");
    await expect(resetAdministratorPassword("c@exemplo.com")).rejects.toThrow(/administrador/i);
    await expect(resetAdministratorPassword("ninguem@exemplo.com")).rejects.toThrow(/não encontr/i);
    expect((await linha(id)).role).toBe("cliente");
    expect(await authenticate("c@exemplo.com", SENHA)).toMatchObject({ id }); // a senha dele não mudou
  });
});

describe("listAdministrators", () => {
  it("lista só os administradores, sem hash de senha", async () => {
    await criarCliente("cliente@exemplo.com");
    await createAdministrator({ email: "b@loja.com", nome: "Bia Admin", celular: "11987654321" });
    await createAdministrator({ email: "a@loja.com", nome: "Ana Admin", celular: "11987654321" });
    const lista = await listAdministrators();
    expect(lista.map((a) => a.email)).toEqual(["b@loja.com", "a@loja.com"]); // por ordem de criação
    expect(lista[0]).toMatchObject({ name: "Bia Admin", mustChangePassword: true });
    expect(JSON.stringify(lista)).not.toMatch(/hash|scrypt/i);
  });

  it("não lista contas anonimizadas nem quem perdeu o papel", async () => {
    const a = await createAdministrator({ email: "a@loja.com", nome: "Ana Admin", celular: "11987654321" });
    await createAdministrator({ email: "b@loja.com", nome: "Bia Admin", celular: "11987654321" });
    await removeAdministrator("b@loja.com");
    expect((await listAdministrators()).map((x) => x.id)).toEqual([a.id]);
    await anonymizeCustomer(a.id);
    expect(await listAdministrators()).toEqual([]);
    expect(await getCustomer(a.id)).toBeNull();
  });
});
