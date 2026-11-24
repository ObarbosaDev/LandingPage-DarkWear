# Contas de cliente, "Meus pedidos" e frete: desenho

Data: 2026-11-23. Estado: aguardando aprovação do dono.

## Intenção

O dono quer que **comprar exija cadastro**. O cliente cria uma conta, entra, vê os próprios pedidos em "Meus pedidos" e, no fechamento, vê o frete. O frete vem da API dos Correios; se isso for difícil ou falhar, o frete cai para "a combinar no WhatsApp", como é hoje.

## Objetivos

- Pedido sempre ligado a um cliente identificado.
- O cliente acompanha seus pedidos (status, itens, pagamento, histórico) sem precisar falar com a loja.
- O frete nunca trava uma compra.

## Não objetivos

- Entrar com Google e link por e-mail (sem senha): dependem de contas externas do dono. O modelo deixa espaço, não entram agora.
- Recuperação de senha por e-mail: precisa de serviço de e-mail. Entra quando o dono tiver um.
- CPF: não é coletado (mínimo de dado pessoal, LGPD). O Mercado Pago pergunta na página dele, se precisar.
- Ligar pedidos antigos (feitos sem cadastro) a clientes.

## O que seria um fracasso, mesmo funcionando

- Um cliente enxergar pedido de outro.
- Senha ou dado pessoal vazar (log, resposta, URL).
- Frete errado cobrado sem aviso, ou compra travada por causa dele.

## Restrições

- Next.js 16 do projeto (Server Actions, Cache Components), Drizzle, Postgres (Neon em produção, PGlite em desenvolvimento e testes).
- Regras do projeto: dinheiro em centavos, `server-only`, comentários em português explicando o quê, por quê e onde, commits só `fix`/`feat`/`chore` de uma linha, visual preto e branco, texto sempre legível, cada página com ideia própria.
- Migrações em SQL (`db/migrations`), com `up` e `down`; migrações já publicadas não se editam.
- Correios: só há preço oficial com contrato da loja (usuário, código de acesso e cartão de postagem). Peso, dimensões dos produtos e CEP de origem não existem hoje.

## Abordagens consideradas (login)

| | O que é | Prós | Contras |
|---|---|---|---|
| **A (escolhida pelo dono)** | E-mail e senha, no projeto: hash com `scrypt` (já vem no Node), sessão em cookie assinado (mesmo modelo do painel) | Sem serviço externo nem custo; dados no nosso banco | Recuperação de senha por e-mail fica para depois |
| B | Provedor pronto (Clerk) | Recuperação e Google prontos | Dados fora do nosso banco, custo possível, mais uma conta |
| C | Link por e-mail, sem senha | Simples para o cliente | Exige serviço de e-mail desde o início |

## O que o dono decidiu

- Cadastro **obrigatório** para comprar (inclusive o fechamento por WhatsApp).
- Login por e-mail e senha (A).
- Frete: tentar os Correios; se não der, WhatsApp.

## Decisões minhas (o dono pode corrigir)

- **Cadastro:** nome, e-mail, celular, senha. Aceite da política de privacidade no cadastro.
- **Senha:** de 10 a 128 caracteres, diferente do e-mail. Hash `scrypt` com sal próprio por senha. Comparação em tempo constante.
- **E-mail:** guardado em minúsculas, único. Login com mensagem genérica ("e-mail ou senha incorretos"), sem dizer qual errou.
- **Sessão:** cookie `httpOnly`, `sameSite=lax`, `secure` em produção, assinado com HMAC (`CUSTOMER_SESSION_SECRET`, mínimo de 32 caracteres), 30 dias. O cookie leva o id do cliente, a validade e a "versão da sessão" do cliente: trocar a senha ou sair de todos os aparelhos aumenta a versão e invalida os cookies antigos.
- **Anti-abuso:** limite de tentativas de login e de cadastros por origem e por e-mail, usando a tabela `rate_limits` que já existe.
- **Pedido e dono:** `orders.customer_id` (chave estrangeira, anulável só por causa dos pedidos antigos). `POST /api/orders` exige sessão de cliente. Toda consulta de pedido do cliente filtra por `customer_id` no banco, nunca só pelo número.
- **Meus pedidos:** `/conta/pedidos` (lista) e `/conta/pedidos/[numero]` (itens, valores, situação, histórico, pagamento). Pedido de outro cliente responde "não encontrado" (404, mesma resposta de número inexistente).
- **Retorno do pagamento:** `/pagamento/retorno` passa a exigir que o pedido seja do cliente logado.
- **Conta:** `/conta` (dados, trocar senha, sair de todos os aparelhos) e "Excluir minha conta", que **anonimiza** o cliente (nome, e-mail e celular apagados) e mantém os pedidos, que a loja precisa guardar.
- **Painel do dono:** pedidos passam a mostrar nome, e-mail e celular do cliente. Lista mínima de clientes com "gerar senha provisória" (mostrada uma vez, obriga a trocar no próximo login), que cobre a falta de recuperação por e-mail.
- **Sacola:** o carrinho continua no navegador. Sem login, o botão de fechar leva a entrar ou cadastrar e depois volta à sacola, sem perder os itens.
- **Endereço (etapa 2):** CEP, rua, número, complemento, bairro, cidade e UF na conta; o pedido guarda uma cópia do endereço usado (não muda se a conta mudar depois). CEP consultado por ViaCEP, com preenchimento manual se falhar.
- **Frete (etapa 3):** peso e dimensões configuráveis por produto no painel (com padrão para camiseta). Cálculo pelos Correios com contrato, com prazo de resposta curto. Falha, falta de credencial ou CEP sem cobertura: frete "a combinar no WhatsApp", pedido segue. O valor do frete entra em centavos no total do pedido, no Mercado Pago e na mensagem do WhatsApp, e fica gravado no pedido. A integração só é escrita depois de conferir a documentação oficial dos Correios (formato de autenticação e de consulta de preço), como foi feito com o Mercado Pago.

## O que fica com quem constrói

Nomes de colunas, estrutura de arquivos, textos das telas e o visual das páginas novas (preto e branco, uma ideia criativa por página). A forma exata das chamadas aos Correios, após ler a documentação.

## Etapas

1. **Contas e "Meus pedidos"** (migração, cadastro, login, sessão, vínculo do pedido, páginas da conta, painel do dono, testes).
2. **Endereço** na conta e no pedido.
3. **Frete** (Correios com plano B no WhatsApp).

Cada etapa é entregue, testada e commitada antes da próxima.

## Dependências do dono (fora do código)

- Etapa 1: nada além de `CUSTOMER_SESSION_SECRET` na Vercel.
- Etapa 3: contrato com os Correios (usuário, código de acesso, cartão de postagem) e o CEP de origem. Sem isso, o frete fica sempre no WhatsApp.
