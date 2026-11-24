# Contas de cliente e "Meus pedidos" (etapa 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cadastro e login de clientes por e-mail e senha, compra exigindo login, pedido ligado ao cliente e área "Meus pedidos".

**Architecture:** Módulo novo `src/server/customers/` (senha, dados, sessão) separado do painel do dono. Sessão em cookie assinado com HMAC (mesmo modelo de `src/server/admin/auth.ts`) com "versão da sessão" para invalidar cookies. `orders.customer_id` liga o pedido ao cliente; toda leitura de pedido do cliente filtra por `customer_id` no banco.

**Tech Stack:** Next.js 16 (Server Actions, Cache Components), Drizzle + Postgres (PGlite nos testes), `node:crypto` (`scrypt`, `createHmac`, `timingSafeEqual`), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-23-contas-e-frete-design.md`

## Global Constraints

- Dinheiro em centavos inteiros; módulos de `src/server` começam com `import "server-only"`.
- Comentários em português explicando o quê, por quê e onde, ao longo do código.
- Commits só `fix`/`feat`/`chore`, **uma linha**, sem citar IA, sem `Co-Authored-By`; **push só quando o usuário mandar**.
- Visual preto e branco, sem vermelho, sem slogan, texto sempre legível (nunca cinza fraco), nada torto, cada página nova com uma ideia própria.
- Migração nova em `db/migrations/NNNN_nome.up.sql` e `.down.sql`; nunca editar migração publicada (0001 a 0006).
- Senha: 10 a 128 caracteres, diferente do e-mail; hash `scrypt` com sal por senha; comparação em tempo constante.
- E-mail em minúsculas, único. Mensagem de login genérica: "E-mail ou senha incorretos."
- Cookie: `httpOnly`, `sameSite=lax`, `secure` em produção, 30 dias, assinado com `CUSTOMER_SESSION_SECRET` (mínimo de 32 caracteres).
- Cadastro: nome, e-mail, celular, senha e aceite da política de privacidade. Sem CPF.
- Pedido de outro cliente responde 404, igual a número inexistente.
- Tudo em português correto, com acentuação.
- Telas de conta **autorais**, não formulário padrão: cada uma com uma ideia visual própria, em preto e branco, sem rotação (nada torto), texto sempre legível.
- Acesso de admin **escondido**: nenhum link nem texto público para `/admin`; `/admin` sai do `robots.txt` (listar o caminho o denuncia; o `noindex` do layout do painel continua). A proteção real segue sendo a senha e o limite de tentativas; esconder é só discrição.

## Review Focus

- **E-mail com maiúsculas, espaços nas pontas ou repetido** (`Ana@X.com` e `ana@x.com`): é a mesma conta; o cadastro concorrente do mesmo e-mail dá erro amigável, não 500.
- **Senha estranha:** só espaços, 9 e 129 caracteres, emoji, igual ao e-mail; emoji e espaços internos valem, os outros casos são recusados.
- **Redirecionamento aberto:** `?next=https://outro.site`, `//outro.site`, `/\outro` e caminhos fora de `/conta` e `/carrinho` viram `/conta`.
- **Cookie velho ou de conta apagada:** cookie com versão antiga (senha trocada ou "sair de todos"), cliente anonimizado ou id inexistente nunca autentica.
- **Pedido de outro cliente** (número de outra pessoa, número inexistente, lixo no endereço): sempre 404, sem revelar que existe.
- **Login de e-mail inexistente** leva o mesmo tempo e dá a mesma mensagem que senha errada (hash falso para igualar).

---

### Task 1: Migração `0007_clientes` e esquema

**Files:**
- Create: `db/migrations/0007_clientes.up.sql`, `db/migrations/0007_clientes.down.sql`
- Modify: `src/server/db/schema.ts`, `tests/helpers/db.ts`
- Test: `tests/customers-schema.test.ts`

**Interfaces:**
- Produces: tabela `customers` (`id`, `name`, `email` único, `phone`, `passwordHash`, `sessionVersion` int padrão 1, `mustChangePassword` bool padrão false, `privacyAcceptedAt`, `anonymizedAt` anulável, `createdAt`, `updatedAt`) exportada como `customers` do `schema.ts`; coluna `orders.customerId` (inteiro anulável, FK `ON DELETE SET NULL`, índice).

- [ ] **Step 1: Teste que falha** `customers-schema.test.ts`: `email` repetido em caixa diferente é recusado pelo banco (CHECK `email = lower(email)` e UNIQUE); nome vazio e celular sem dígitos são recusados; `orders.customer_id` aceita `NULL` e id existente e recusa id inexistente.
- [ ] **Step 2: Rodar** `npx vitest run tests/customers-schema.test.ts`. Esperado: FAIL (tabela não existe).
- [ ] **Step 3: Escrever** o `up` (tabela, CHECKs, `ALTER TABLE orders ADD COLUMN customer_id`, índice, gatilho `set_updated_at` já existente) e o `down` (remove coluna e tabela, com comentário de que apaga as contas). Descrever `customers` e `orders.customerId` em `schema.ts`. Em `resetDb`, apagar `customers` depois dos pedidos.
- [ ] **Step 4: Rodar** o teste novo e `npx vitest run tests/migrations-updown.test.ts tests/migrations.test.ts`. Esperado: PASS (as migrações em ciclo sobem e descem com a 0007).
- [ ] **Step 5: Commits** (um por ação): `feat: migração de clientes e vínculo do pedido ao cliente`, `feat: tabela de clientes no esquema do banco`, `chore: limpeza de clientes nos testes de banco`.

### Task 2: Senha (`password.ts`)

**Files:**
- Create: `src/server/customers/password.ts`
- Test: `tests/customers-password.test.ts`

**Interfaces:**
- Produces: `validatePassword(password: string, email: string): string | null` (texto do erro ou `null`); `hashPassword(password: string): Promise<string>` (formato `scrypt$N$r$p$saltHex$hashHex`); `verifyPassword(password: string, stored: string): Promise<boolean>`; `fakeVerify(): Promise<void>` (gasta o mesmo tempo de uma verificação, para e-mail inexistente).

- [ ] **Step 1: Testes que falham:** `validatePassword` recusa 9 e 129 caracteres, só espaços, igual ao e-mail (sem diferenciar caixa) e aceita 10 e 128, emoji e espaços internos; `hashPassword` gera hashes diferentes para a mesma senha; `verifyPassword` aceita a certa, recusa a errada, recusa formato corrompido e hash vazio sem lançar erro.
- [ ] **Step 2: Rodar** o arquivo. Esperado: FAIL (módulo não existe).
- [ ] **Step 3: Implementar** com `scrypt` assíncrono (parâmetros gravados no próprio hash, para poder mudar depois), sal de 16 bytes, `timingSafeEqual`.
- [ ] **Step 4: Rodar.** Esperado: PASS.
- [ ] **Step 5: Commits:** `feat: validação e hash de senha dos clientes`, `feat: verificação de senha em tempo constante`, `feat: verificação falsa para igualar o tempo do login`.

### Task 3: Dados do cliente (`customers/index.ts`)

**Files:**
- Create: `src/server/customers/index.ts`
- Test: `tests/customers.test.ts`

**Interfaces:**
- Consumes: Task 1 (`customers`), Task 2 (`hashPassword`, `verifyPassword`, `validatePassword`, `fakeVerify`).
- Produces:
  - `parseRegisterForm(form: FormData): { ok: true; data: RegisterInput } | { ok: false; error: string }` (nome 2 a 80, e-mail válido até 254 em minúsculas e sem espaços nas pontas, celular com 10 a 11 dígitos após remover máscara, aceite obrigatório);
  - `registerCustomer(input: RegisterInput): Promise<{ ok: true; id: number } | { ok: false; error: string }>` (e-mail repetido, inclusive em corrida, vira `error` amigável);
  - `authenticate(email: string, password: string): Promise<{ id: number; sessionVersion: number; mustChangePassword: boolean } | null>`;
  - `getCustomer(id: number): Promise<CustomerView | null>` (nunca devolve o hash; `null` se anonimizado);
  - `changePassword(id: number, current: string, next: string): Promise<"ok" | "senha-atual" | "invalida">` (aumenta `sessionVersion`, limpa `mustChangePassword`);
  - `signOutEverywhere(id: number): Promise<number>` (novo `sessionVersion`);
  - `anonymizeCustomer(id: number): Promise<void>` (nome "Cliente removido", e-mail `removido-<id>@invalid`, celular vazio, hash inutilizável, `anonymizedAt`, aumenta `sessionVersion`);
  - `setTemporaryPassword(id: number): Promise<string>` (senha provisória aleatória, `mustChangePassword = true`, aumenta `sessionVersion`).

- [ ] **Step 1: Testes que falham** nomeados pelo comportamento: cadastro normaliza e-mail; `Ana@X.com ` e `ana@x.com` são a mesma conta; dois cadastros simultâneos do mesmo e-mail resultam em um sucesso e um erro amigável; `authenticate` com senha certa, errada, e-mail inexistente e conta anonimizada (só a primeira passa); `changePassword` com senha atual errada e senha nova inválida não muda nada e a certa aumenta a versão; `anonymizeCustomer` mantém os pedidos e tira o acesso; `setTemporaryPassword` obriga a troca; nenhuma função devolve `passwordHash`.
- [ ] **Step 2: Rodar.** Esperado: FAIL.
- [ ] **Step 3: Implementar** com Drizzle; violação de UNIQUE tratada pelo código de erro do Postgres; `authenticate` chama `fakeVerify()` quando o e-mail não existe.
- [ ] **Step 4: Rodar.** Esperado: PASS.
- [ ] **Step 5: Commits** (um por função grande): `feat: cadastro de cliente com validação`, `feat: autenticação de cliente`, `feat: troca de senha e saída de todos os aparelhos`, `feat: exclusão de conta que preserva os pedidos`, `feat: senha provisória para o painel`.

### Task 4: Sessão do cliente (`customers/session.ts`)

**Files:**
- Create: `src/server/customers/session.ts`
- Modify: `src/server/env.ts`, `tests/env.test.ts`, `tests/setup.ts`, `.env.example`
- Test: `tests/customers-session.test.ts`

**Interfaces:**
- Consumes: Task 3 (`getCustomer`; adicionar leitura da `sessionVersion` atual).
- Produces: `signSession(p: { id: number; version: number; exp: number }, secret: string): string`; `verifySession(token: string, secret: string, now?: number): { id: number; version: number } | null`; `startCustomerSession(id: number, version: number): Promise<void>`; `endCustomerSession(): Promise<void>`; `currentCustomer(): Promise<CustomerView | null>` (confere assinatura, validade, versão e conta não anonimizada); `requireCustomer(next?: string): Promise<CustomerView>` (redireciona para `/conta/entrar?next=...` com `next` seguro); `safeNext(raw: unknown, fallback?: string): string` (só caminhos que começam com `/conta` ou `/carrinho`, sem `//`, `\` nem esquema).
- `checkEnv`: com `CUSTOMER_SESSION_SECRET` ausente em produção é **erro**; com menos de 32 caracteres, erro.

- [ ] **Step 1: Testes que falham:** `verifySession` recusa assinatura adulterada, token vencido, token sem partes e segredo diferente; `currentCustomer` recusa versão antiga e cliente anonimizado; `safeNext` com `https://x`, `//x`, `/\x`, `/admin`, `javascript:alert(1)`, vazio e `null` devolve o padrão, e `/carrinho` e `/conta/pedidos` passam; `checkEnv` cobre o segredo ausente, curto e correto. Mockar `next/headers` (cookies) como em `tests/auth.test.ts`.
- [ ] **Step 2: Rodar.** Esperado: FAIL.
- [ ] **Step 3: Implementar** espelhando `src/server/admin/auth.ts` (HMAC-SHA256, `timingSafeEqual`, `connection()` antes de ler cookies).
- [ ] **Step 4: Rodar** os arquivos novos e `tests/env.test.ts`. Esperado: PASS.
- [ ] **Step 5: Commits:** `feat: assinatura e leitura da sessão do cliente`, `feat: sessão do cliente com versão para invalidar cookies`, `feat: redirecionamento seguro depois do login`, `feat: conferência do segredo de sessão do cliente`, `chore: variável da sessão do cliente no exemplo de ambiente`.

### Task 5: Ações e páginas de entrar, cadastrar e conta

**Files:**
- Create: `src/app/actions-cliente.ts` (Server Actions: `registerAction`, `loginAction`, `logoutAction`, `changePasswordAction`, `signOutEverywhereAction`, `deleteAccountAction`), `src/app/(site)/conta/entrar/page.tsx`, `src/app/(site)/conta/cadastro/page.tsx`, `src/app/(site)/conta/page.tsx`, `src/app/(site)/privacidade/page.tsx`, componentes de formulário em `src/components/conta/`
- Modify: `src/components/Header.tsx` (entrada "Conta" / "Entrar")
- Test: `tests/customers-actions.test.ts`

**Interfaces:**
- Consumes: Tasks 3 e 4; `rateLimit(bucket, key, max, windowMs)` e `clientKey()` de `src/server/rate-limit.ts`.
- Produces: ações com o formato `(prev: FormState, form: FormData) => Promise<FormState>`; limites: login 8 por 15 min por origem **e** 5 por 15 min por e-mail; cadastro 5 por hora por origem.

- [ ] **Step 1: Testes que falham:** login certo abre sessão e vai ao `next` seguro; errado devolve a mensagem genérica; o 6º erro no mesmo e-mail é bloqueado mesmo vindo de origens diferentes; cadastro duplicado devolve erro amigável sem criar conta; `deleteAccountAction` pede a senha, anonimiza e encerra a sessão; trocar a senha invalida a sessão de outro aparelho. Mockar `next/headers` e `next/navigation` (`redirect` lança).
- [ ] **Step 2: Rodar.** Esperado: FAIL.
- [ ] **Step 3: Implementar** as ações e as páginas. Formulários mantêm o que foi digitado em erro, como `ProductForm`. Política de privacidade curta e honesta: quais dados, para quê, por quanto tempo, como excluir. Direção visual proposta (o construtor pode melhorar, mantendo as regras do projeto):
  - **Cadastro = etiqueta de camiseta.** A página é uma etiqueta costurada em tamanho grande: os campos são as linhas da etiqueta (nome, e-mail, celular, senha) e, no topo, o número da peça vira o número do cliente ("Peça nº 00042", o próximo id).
  - **Entrar = provador.** Uma cabine com a cortina como fundo preto e uma "porta" branca com o formulário; ao entrar com sucesso, a porta abre (transição curta, respeitando `prefers-reduced-motion`).
  - **Conta = cabide.** A conta é um cabide com os "pedidos pendurados": cada pedido é uma etiqueta com o número `DW-` e a situação em letras grandes.
  - **Acesso de admin escondido (sem link visível):** em `/conta/entrar`, a costura da etiqueta do provador tem um detalhe sem rótulo; segurar o clique nele por 2 segundos leva a `/admin/login`. Sem texto, sem `aria-label` que o anuncie e sem rastro no HTML além do próprio elemento. Remover `/admin` do `disallow` de `src/app/robots.ts` e ajustar o comentário.
- [ ] **Step 4: Rodar** os testes e abrir as páginas no navegador (cadastro, login, conta, erro de senha, link do cabeçalho). Esperado: PASS e telas sem texto cortado.
- [ ] **Step 5: Commits:** `feat: ações de cadastro e entrada do cliente`, `feat: página de cadastro em forma de etiqueta`, `feat: página de entrada em forma de provador`, `feat: página da conta com troca de senha`, `feat: excluir conta pelo cliente`, `feat: política de privacidade`, `feat: link de conta no cabeçalho`, `feat: acesso escondido ao painel do dono`, `chore: caminho do painel fora do robots`.

### Task 6: Pedido ligado ao cliente e "Meus pedidos"

**Files:**
- Modify: `src/server/orders.ts` (`createOrder(input: unknown, customerId: number)`), `src/app/api/orders/route.ts`, `src/app/(site)/carrinho/page.tsx`, `src/app/(site)/pagamento/retorno/page.tsx`, `src/server/payments/index.ts` (`getPaymentView(number, customerId)`), `tests/orders.test.ts`, `tests/payments-routes.test.ts`, `tests/payments.test.ts`
- Create: `src/server/customers/orders.ts`, `src/app/(site)/conta/pedidos/page.tsx`, `src/app/(site)/conta/pedidos/[numero]/page.tsx`
- Test: `tests/customers-orders.test.ts`

**Interfaces:**
- Consumes: Tasks 3 e 4.
- Produces: `listCustomerOrders(customerId: number): Promise<CustomerOrder[]>` e `getCustomerOrder(customerId: number, number: string): Promise<CustomerOrderDetail | null>` (itens, total, status, histórico, pagamentos; `null` se o pedido não é do cliente, não existe ou o número é inválido).
- `POST /api/orders`: 401 `{ error: "Entre na sua conta para comprar." }` sem sessão; com sessão, `customerId` vem da sessão (o corpo é ignorado). A sacola, sem login, leva a `/conta/entrar?next=/carrinho` sem esvaziar.

- [ ] **Step 1: Testes que falham:** `createOrder` grava `customer_id`; rota sem sessão responde 401 e **não baixa estoque**; `listCustomerOrders` devolve só os do cliente; `getCustomerOrder` com pedido de outro cliente, inexistente, `DW-1`, `DW-00001' OR 1=1` e vazio retorna `null`; `/pagamento/retorno` de pedido alheio dá 404. Ajustar os testes existentes de pedidos e pagamentos para passarem um cliente.
- [ ] **Step 2: Rodar.** Esperado: FAIL.
- [ ] **Step 3: Implementar** o vínculo, a exigência de sessão na rota, o redirecionamento da sacola e as duas páginas de "Meus pedidos" (lista com status em letras grandes; detalhe com itens, valores, histórico e pagamento; uma ideia visual própria).
- [ ] **Step 4: Rodar a suíte inteira** (`npx vitest run`). Esperado: PASS. Verificar no navegador: sacola sem login, cadastro, compra pelo WhatsApp, pedido na lista.
- [ ] **Step 5: Commits:** `feat: pedido guarda o cliente que comprou`, `feat: comprar exige login`, `feat: sacola leva ao login sem perder os itens`, `feat: consultas de pedidos do cliente`, `feat: página meus pedidos`, `feat: página de detalhe do pedido do cliente`, `fix: retorno do pagamento só mostra o pedido do próprio cliente`.

### Task 7: Admin por e-mail e senha (substitui a senha única) e tela de admin

**Requisito novo do dono (durante a execução):** a tela de admin tem de ser perfeita; não pode haver nenhum botão, link ou gesto de admin na tela de entrar; o dono vai entregar e-mail e senha à pessoa que administra a loja.

**Decisão:** o admin é uma **conta** com `customers.role = 'admin'`, que entra pela MESMA tela `/conta/entrar` e é levada a `/admin`. A senha única `ADMIN_PASSWORD` e o cookie `dw_admin` saem. O papel só é concedido por **comando de terminal do dono** (`npm run admin:criar`), nunca pela web.

**Files:**
- Create: `db/migrations/0008_papel_de_admin.up.sql` / `.down.sql`, `scripts/admin.ts`, `src/app/admin/(painel)/clientes/page.tsx`, `src/server/admin/customers.ts`, `tests/admin-access.test.ts`, `tests/admin-customers.test.ts`
- Modify: `src/server/db/schema.ts`, `src/server/customers/index.ts` (papel e `mustChangePassword` no `CustomerView`), `src/server/customers/session.ts` (`iat` no token), `src/server/admin/auth.ts` (`requireAdmin` por papel), `src/app/actions-cliente.ts` (login leva admin ao painel; troca obrigatória de senha), `src/app/admin/**` (remover login por senha; novo visual), `src/server/env.ts`, `package.json`, `README.md`, `.env.example`
- Delete: `src/app/admin/login/**`, `loginAction`/`logoutAction` do painel por senha, `ADMIN_PASSWORD`/`ADMIN_SESSION_SECRET`

**Interfaces:**
- Produces: `CustomerView.role: "cliente" | "admin"`; `isAdmin(): Promise<boolean>`; `requireAdmin(): Promise<CustomerView>` (404 para quem não é admin, sem revelar que o painel existe; exige login feito nas últimas 12 horas); `listCustomers()`; `resetCustomerPasswordAction(form)`.
- Regras de segurança: o papel nunca vem de formulário; sessão de admin vale 12 h desde o login (o cookie de cliente continua 30 dias); o primeiro login de um admin criado por comando obriga a trocar a senha; admin não pode excluir a própria conta por `/conta` enquanto for o único admin.

- [ ] **Step 1: Testes que falham** (`admin-access`): `requireAdmin` dá 404 para anônimo, para cliente comum e para conta anonimizada; passa para admin com login recente; recusa admin com login de mais de 12 h; recusa cookie com versão antiga; o papel não muda por nenhum formulário (cadastro e troca de senha ignoram `role`); `loginAction` leva admin a `/admin` e cliente a `/conta`; `?next=/admin` não leva cliente comum ao painel.
- [ ] **Step 2: Rodar.** Esperado: FAIL.
- [ ] **Step 3: Implementar** migração, papel, `iat`, `requireAdmin`, redirecionamento do login, remoção do login por senha e do `dw_admin`.
- [ ] **Step 4: Comando `admin:criar`** (cria ou promove por e-mail, gera senha provisória exibida uma vez, marca troca obrigatória), `admin:remover` e `admin:senha`; testar o núcleo (função pura de `scripts/admin.ts`) contra o banco em memória.
- [ ] **Step 5: Tela de admin nova** (ver Review Focus): painel, pedidos, produtos, encomendas e clientes, com navegação consistente, busca e filtros, estados vazios e erros claros; texto sempre legível; sem acesso de admin visível fora do painel. Verificar no navegador, inclusive em celular.
- [ ] **Step 6: Commits pequenos** (`feat: papel de administrador nas contas`, `feat: painel só abre para administradores`, `feat: comando para criar administradores`, `chore: tira a senha única do painel`, `feat: lista de clientes no painel`, `feat: senha provisória gerada pelo painel`, e um commit por tela redesenhada).

### Task 8: Fechamento da etapa

**Files:**
- Modify: `README.md`, `.env.example`, `docs/superpowers/specs/2026-11-23-contas-e-frete-design.md` (estado: etapa 1 entregue)
- Test: suíte inteira, lint, build

- [ ] **Step 1:** Documentar no README (contas, sessão, LGPD, painel, `CUSTOMER_SESSION_SECRET`, senha provisória, limitação de recuperação por e-mail) e atualizar "Estado atual e limitações" e "Próximos passos".
- [ ] **Step 2: Rodar** `npx tsc --noEmit -p .`, `npx eslint .`, `npx vitest run` e `next build`. Esperado: tudo verde, sem avisos novos.
- [ ] **Step 3: Teste por mutação** nas guardas principais (filtro por `customer_id`, versão da sessão, `safeNext`): cada mutação derruba ao menos um teste; restaurar os arquivos depois.
- [ ] **Step 4: Commits:** `chore: documenta contas de cliente e meus pedidos`, `chore: variáveis de ambiente das contas no exemplo`. **Sem push:** aguardar o usuário.
