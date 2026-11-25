# DarkWear

Loja online de camisetas estampadas em DTF. O cliente escolhe uma peça pronta do estoque ou envia a própria arte para produzir sob encomenda. O preço e o prazo são combinados pelo WhatsApp antes de qualquer pagamento.

## Sumário

- [Funcionalidades](#funcionalidades)
- [Stack](#stack)
- [Como rodar](#como-rodar)
- [Configuração](#configuração)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Como ler o código](#como-ler-o-código)
- [Rotas](#rotas)
- [API](#api)
- [Identidade visual](#identidade-visual)
- [Estado atual e limitações](#estado-atual-e-limitações)
- [Próximos passos](#próximos-passos)

## Funcionalidades

- **Catálogo:** vitrine na home com filtro por categoria (Todos, Pronta entrega, Coleção) e busca por nome na loja.
- **Arco de produtos:** carrossel 3D de cards na home. Arrasta com o mouse, rola com a roda, usa as setas ou clica no card.
- **Página de produto:** foto, descrição, escolha de tamanho e cor. O estoque é **por tamanho e cor**: o tamanho sem unidades na cor escolhida aparece riscado e não pode ser comprado.
- **Carrinho:** persiste no navegador (`localStorage`) e fecha o pedido pelo WhatsApp com uma mensagem já montada, ou paga online com cartão (crédito e débito) e Pix pelo Mercado Pago, quando configurado.
- **Encomenda personalizada:** o cliente escolhe modelo, cor, tamanho e a posição da arte (frente, costas, peito ou manga), envia o arquivo (PNG, JPG, SVG ou PDF, até 25 MB) e confirma pelo WhatsApp. O arquivo da arte é anexado na própria conversa.
- **Páginas institucionais:** Sobre, FAQ e Contato.
- **Acessibilidade de movimento:** as animações respeitam a preferência de reduzir movimento do sistema.

## Stack

| Camada | Tecnologia |
| --- | --- |
| Framework | [Next.js](https://nextjs.org) 16 (App Router, Cache Components) |
| UI | React 19 |
| Estilo | Tailwind CSS 4 + CSS próprio (`globals.css`, `motion.css`) |
| Linguagem | TypeScript 5 |
| Banco de dados | Postgres: Neon em produção (Marketplace da Vercel) e PGlite embutido em desenvolvimento |
| Acesso a dados | Drizzle ORM |
| Qualidade | ESLint 9 |
| Fontes | Anton (títulos), Archivo (texto), Geist Mono (rótulos), via `next/font` |

## Como rodar

Requisitos: **Node.js 20.9 ou superior** e npm.

```bash
git clone https://github.com/ObarbosaDev/LandingPage-DarkWear.git
cd LandingPage-DarkWear
npm install
npm run dev
```

O site abre em `http://localhost:3000`.

### Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção, com checagem de tipos |
| `npm run start` | Serve o build de produção |
| `npm run lint` | Roda o ESLint |
| `npm test` | Roda os testes (Vitest), uma vez |
| `npm run test:watch` | Roda os testes e repete a cada mudança |

### Testes

Os testes ficam em `tests/` e rodam com um Postgres em memória (PGlite), sem configurar nada. Cobrem as regras que mexem com dinheiro e estoque:

- preço e formulário de produto (leitura de "89,90" e "1.299", limites, foto só em `/products/`);
- criação de pedido (total calculado no servidor, tudo ou nada, estoque insuficiente, produto oculto);
- cancelamento (devolve o estoque uma vez só, mesmo com vários cancelamentos ao mesmo tempo);
- fluxo de status do painel, encomenda personalizada e carrinho salvo no navegador;
- senha, sessão assinada (adulteração, expiração) e limite de tentativas de login.

Limite conhecido: o PGlite atende uma consulta por vez, então os testes de concorrência provam a regra (nunca vender além do estoque), mas não a disputa de linhas de um Postgres real. Isso só se testa contra o Neon.

A cada envio para a `main` e em todo pull request, o GitHub roda lint, testes e build (`.github/workflows/ci.yml`).

## Configuração

### Banco de dados

Em desenvolvimento não é preciso configurar nada: sem `DATABASE_URL`, o projeto usa um Postgres embutido (PGlite), gravado em `.data/pglite` e ignorado pelo git. Na primeira execução o catálogo é carregado de `src/server/db/seed-data.ts` para o banco. Para recomeçar do zero em desenvolvimento, apague a pasta `.data`.

| Variável | Para que serve |
| --- | --- |
| `DATABASE_URL` | Conexão com o Postgres de produção (Neon). Na Vercel, o Marketplace cria o banco e injeta essa variável. |
| `PGLITE_DIR` | Opcional. Troca a pasta do banco local (padrão `./.data/pglite`). Com `memory://`, o banco vive só na memória (usado nos testes e no CI). |

**Migrações.** O esquema é versionado em **arquivos SQL** na pasta `db/migrations/`, dois por migração: `0003_integridade.up.sql` (a subida, que aplica a mudança) e `0003_integridade.down.sql` (a descida, que a desfaz). São SQL puro: dá para ler, colar no console do Neon e versionar no Git. O executor fica em `src/server/db/migrations.ts`. Uma migração sem arquivo `.down.sql` é irreversível (é o caso da `0001_baseline`, porque desfazê-la apagaria todas as tabelas), e o sistema se recusa a desfazê-la.

| Comando | O que faz |
| --- | --- |
| `npm run db:status` | mostra quais migrações estão aplicadas, quais estão pendentes e quais podem ser desfeitas |
| `npm run db:migrate` | aplica as migrações pendentes (as subidas) |
| `npm run db:demo` | **só no banco local:** cria 8 clientes, 12 pedidos em todas as etapas e 2 cupons de exemplo (senha dos clientes impressa no fim; `-- --refazer` recomeça). Recusa rodar se `DATABASE_URL` existir |
| `npm run db:rollback` | mostra o que seria desfeito; com `-- --confirm`, desfaz a última migração |
| `npm run db:rollback -- 2 --confirm` | desfaz as duas últimas |

Garantias do executor:

- **Uma por vez, em transação.** Cada migração roda na sua transação: se uma falha, as anteriores continuam valendo e a que falhou não deixa rastro.
- **Trava contra corrida.** Dois processos (dois servidores, ou o servidor e o `db:migrate`) nunca migram ao mesmo tempo.
- **Carimbo de cada migração.** Ao aplicar, o sistema guarda um resumo (SHA-256) do `up`. Se alguém **editar uma migração já aplicada**, o sistema recusa seguir e diz qual foi alterada. A regra é: nunca edite uma migração existente, crie uma nova no fim da lista.
- **Desfazer é tudo ou nada.** Se qualquer uma das migrações a desfazer for irreversível, nada é desfeito.
- **Desfazer pode apagar dados** (por exemplo, o histórico de status). Por isso `db:rollback` exige `--confirm`.

**Subida do servidor.** Por padrão, o servidor aplica as migrações pendentes ao conectar. Para produção com publicação controlada, defina `DB_AUTO_MIGRATE=false`: o servidor passa a **só conferir** se o banco está em dia (e falha com uma mensagem clara se faltar migração), e as migrações rodam antes, com `npm run db:migrate`. Os comandos `db:*` leem o `.env.local`; com `DATABASE_URL` eles falam com o banco de produção, sem ela, com o banco local (pare o servidor de desenvolvimento antes: dois processos no mesmo banco embutido podem corromper os dados).

Para mudar o banco: crie os dois arquivos da migração nova em `db/migrations/` (o próximo número com 4 dígitos, por exemplo `0006_algo.up.sql` e `0006_algo.down.sql`), atualize `src/server/db/schema.ts` e rode `npm run db:migrate`. O carregador recusa nomes fora do padrão, descida sem subida e dois arquivos com o mesmo número. O teste `tests/migrations-frozen.test.ts` guarda o carimbo das migrações já publicadas e quebra no CI se alguém editar uma delas.

Os arquivos `.sql` são incluídos no pacote de produção pelo `outputFileTracingIncludes` do `next.config.ts`: o servidor os lê ao subir. Um banco criado antes das migrações é adotado sem perder dados.

**Integridade.** O banco não confia só no código: ele próprio recusa dado inválido.

| Proteção | O que garante |
| --- | --- |
| `CHECK` em produtos | endereço (slug) no padrão, categoria válida, tamanhos e cores como lista de 1 a 12 itens, foto só dentro de `/products/`, preço e estoque nunca negativos |
| `CHECK` em pedidos e encomendas | só os status que existem; quantidade de 1 a 99 por item |
| Chave estrangeira | todo item de pedido aponta para uma peça que existe, e uma peça que já tem pedido não pode ser apagada |
| Gatilho `updated_at` | a data de alteração de produtos e pedidos é atualizada pelo próprio banco, sem depender do código |
| Índices compostos e parciais | listagem de pedidos por status, expiração de pendentes e vitrine continuam rápidas com muitos dados |
| Trava de linha (`FOR UPDATE`) | duas pessoas mudando ou cancelando o mesmo pedido ao mesmo tempo: só uma vence, e as peças voltam ao estoque uma vez só |

**Histórico de status.** A tabela `order_status_history` guarda cada mudança de status de um pedido: de qual status, para qual, quando e por quem (o cliente, o painel ou o prazo de expiração). Ele aparece em cada pedido em `/admin/pedidos` e responde "quando esse pedido foi pago?". Pedidos que já existiam antes dessa tabela ganham um histórico reconstruído (criação e status atual).

### Contas, clientes e painel do dono

**Comprar exige conta.** O cliente se cadastra (nome, e-mail, celular e senha; sem CPF) em `/conta/cadastro`, entra em `/conta/entrar` e acompanha os pedidos em `/conta/pedidos`. A senha nunca é guardada: só um hash `scrypt`. A sessão é um cookie assinado de 30 dias (`httpOnly`, `sameSite=lax`); trocar a senha ou "sair de todos os aparelhos" derruba os cookies antigos. Entrar tem limite de tentativas por origem (8 em 15 min) e por e-mail (5 erros em 15 min). **Endereço de entrega.** Cada conta tem um endereço (CEP, rua, número, complemento, bairro, cidade e estado), cadastrado na etiqueta "Entrega" de `/conta`, e **comprar exige endereço** (a sacola leva o cliente até lá se faltar). Ao digitar o CEP, o formulário preenche o resto sozinho: a consulta ao ViaCEP é feita pelo **servidor** (só os 8 números saem; o navegador nunca fala com terceiros) e, se falhar, o cliente digita à mão. O pedido guarda uma **cópia** do endereço usado: mudar o endereço da conta depois não desvia pedidos já feitos, e o dono vê para onde despachar em cada ordem da esteira. Ao excluir a conta, o endereço some da conta e dos pedidos já entregues ou cancelados (pedidos em andamento mantêm a cópia até a entrega). O banco garante que não existe endereço pela metade ou inválido.

Cada cliente só vê os próprios pedidos: o de outra pessoa responde "não encontrado", igual a um número que não existe. "Baixar meus dados" (`GET /api/conta/dados`, 5 por hora) entrega um JSON com a conta, o endereço e os pedidos da pessoa, **sem** senha, segundo fator nem dados de outros clientes. "Excluir minha conta" apaga os dados pessoais e mantém os pedidos, sem ligação com a pessoa. A política de privacidade está em `/privacidade`.

| Variável | Para que serve |
| --- | --- |
| `CUSTOMER_SESSION_SECRET` | Segredo que assina o cookie da sessão (mínimo de 32 caracteres, aleatório). **Obrigatório em produção**: sem ele ninguém consegue entrar e, portanto, comprar. |

**O painel não tem senha própria nem tela de login.** Quem administra a loja é uma **conta com papel `admin`**, que entra pela **mesma tela de todo mundo**, com e-mail e senha pessoais, e é levada ao painel. Não existe botão, link nem gesto de admin no site. O papel **só** é concedido por comando de terminal do dono (nunca por formulário ou API):

| Comando | O que faz |
| --- | --- |
| `npm run admin:criar -- --email maria@loja.com --nome "Maria Souza" --celular 11987654321` | cria (ou promove, se a conta já existe) um administrador e mostra uma **senha provisória, uma única vez** |
| `npm run admin:senha -- --email maria@loja.com` | gera outra senha provisória (esqueceu a senha) |
| `npm run admin:remover -- --email maria@loja.com` | tira o acesso ao painel e derruba as sessões abertas |
| `npm run admin:listar` | lista quem administra hoje (e se cada um usa segundo fator) |
| `npm run admin:2fa -- --email maria@loja.com` | **liga o segundo fator**: mostra a chave para cadastrar no aplicativo autenticador (uma única vez) e passa a exigir o código de 6 dígitos no login |
| `npm run admin:2fa-remover -- --email maria@loja.com` | desliga o segundo fator (aparelho perdido, por exemplo) |

Para dar acesso a alguém: rode `admin:criar`, copie o e-mail e a senha provisória e passe à pessoa. No primeiro acesso ela é **obrigada a trocar a senha**. Com `DATABASE_URL` os comandos falam com o banco de produção; sem ela, com o banco local (pare o servidor de desenvolvimento antes).

Como o painel é protegido (três camadas):

1. **Porteiro (`src/proxy.ts`):** antes de qualquer página de `/admin`, confere o cookie assinado. Quem não tem um cookie de administrador válido recebe um **404 de verdade**, idêntico ao de qualquer endereço que não existe (sem título, sem texto, sem pista de que há um painel). O papel no cookie é só uma dica rápida, sem banco.
2. **Banco (`requireAdmin`):** o layout e **cada ação** do painel conferem de novo, no banco, se a conta existe, ainda é administradora e entrou há **menos de 12 horas** (o cookie de cliente vale 30 dias; o acesso ao painel, 12 h). Uma ação chamada direto, sem passar pela tela, é barrada do mesmo jeito.
3. **Papel inalterável pela web:** nenhuma tela escreve o papel. A senha provisória gerada em `/admin/clientes` recusa contas de administrador (elas só se gerenciam pelo terminal).

O painel é o "bastidores" da loja, com uma ideia por tela: **Painel** (fechamento de caixa em forma de recibo e quadro de avisos), **Esteira** (pedidos em colunas Pendente → Pago → Enviado → Entregue, com o botão do passo seguinte no cartão), **Encomendas** (fila de arte, com a ficha de estampa e o mapa da posição), **Prateleira** (produtos em quadrados com a pilha de estoque) e **Caderneta** (clientes em ordem alfabética, com busca e senha provisória). Um letreiro no topo mostra o que espera pelo dono.

**Segundo fator (opcional, recomendado).** Um administrador com `admin:2fa` ligado, depois de acertar a senha, precisa digitar o código do aplicativo autenticador (Google Authenticator, Authy, 1Password...). Sem o código não há sessão, nem cookie de sessão. Cada código vale uma vez, o relógio tolera 30 segundos para cada lado, 5 erros em 15 minutos bloqueiam a conta e o passo do código só vale por 5 minutos depois da senha. A chave fica **cifrada** no banco (AES-256-GCM, derivada de `CUSTOMER_SESSION_SECRET`): **trocar esse segredo invalida os segundos fatores existentes**, e é preciso refazer `admin:2fa`. Só o terminal liga e desliga, como o papel de administrador.

**Diário (`/admin/diario`).** Cada ação do painel (mudar pedido, rastreio, produto, estoque, visibilidade, encomenda, senha provisória) é anotada com o e-mail de quem fez e a hora; o histórico de cada pedido também mostra quem o mudou. O diário só cresce: nenhuma tela o apaga.

**Rastreio.** Ao marcar um pedido como enviado, o painel pergunta o código de rastreio (opcional; dá para informar ou corrigir depois). O cliente o vê na página do pedido, com link dos Correios quando o código tem esse formato.

A conta de administrador é uma conta como as outras (aparece em `/conta`). `ADMIN_PASSWORD` e `ADMIN_SESSION_SECRET` **não são mais usadas** (o servidor avisa se sobrarem no ambiente).

Na Vercel, sem `DATABASE_URL` a aplicação falha com uma mensagem clara, em vez de usar um banco que se perderia a cada execução.

### Pagamento online (Mercado Pago)

O pagamento online é **opcional**: sem `MERCADOPAGO_ACCESS_TOKEN`, o site fecha pedidos só pelo WhatsApp, como antes. Com ele, a sacola ganha o botão "Pagar com cartão ou Pix".

**O cartão nunca passa por este site.** O cliente é levado à página de pagamento do próprio Mercado Pago (Checkout Pro) e digita o cartão lá. O site só cria a cobrança e recebe o aviso do resultado, então não há dado de cartão para proteger nem certificação PCI a cumprir. Crédito, débito e Pix ficam disponíveis; o boleto fica de fora de propósito, porque leva dias para compensar e seguraria as peças no estoque.

| Variável | Para que serve |
| --- | --- |
| `MERCADOPAGO_ACCESS_TOKEN` | Liga o pagamento online. Vem do painel de desenvolvedores do Mercado Pago. Nunca vai ao navegador. |
| `MERCADOPAGO_WEBHOOK_SECRET` | Assinatura secreta dos avisos (Suas integrações > Webhooks). Sem ela, os avisos não têm a assinatura conferida. |
| `MERCADOPAGO_MAX_INSTALLMENTS` | Máximo de parcelas no cartão, de 1 a 12. Padrão 1 (à vista), porque parcelar tem custo para a loja. |
| `PIX_DISCOUNT_PERCENT` | Desconto, em %, para quem pagar por Pix na sacola (inteiro de 1 a 30; vazio = sem desconto). A sacola ganha o botão "Pagar por Pix" com o valor já descontado e a página do Mercado Pago oferece **só Pix**. |

**Cupons e desconto no Pix.** Em `/admin/cupons` o dono cria cupons (percentual de 1 a 90% ou valor fixo) com pedido mínimo, limite de usos, validade e liga/desliga; cada cliente usa o mesmo cupom **uma vez** (garantido por índice do banco; cancelar o pedido libera o cupom). O desconto de Pix desconta sobre o valor já com o cupom. Regras de dinheiro: tudo em centavos inteiros, percentual arredonda **para baixo**, o total nunca fica abaixo de R$ 1,00, e quem calcula é sempre o servidor (a sacola só mostra a prévia de `/api/cart/preview`, que usa a mesma conta). Como o Mercado Pago não aceita preço negativo, um pedido com desconto vai à página de pagamento como **um item só** pelo valor exato. Um pedido com desconto de Pix pago por cartão **não** é marcado como pago: o painel alerta e o dono decide.
| `MERCADOPAGO_SANDBOX` | `true` usa a página de teste (com as credenciais de teste). |
| `SITE_URL` | Endereço público com `https://`. É para lá que o Mercado Pago avisa e devolve o cliente. |

No painel do Mercado Pago, cadastre o aviso em `<SITE_URL>/api/webhooks/mercadopago`, com o evento "Pagamentos".

Como o pedido é pago:

1. O cliente clica em "Pagar com cartão ou Pix": o servidor cria o pedido (baixando o estoque), abre a cobrança e leva o cliente ao Mercado Pago. Se a cobrança não abrir, o pedido é cancelado na hora e as peças voltam ao estoque.
2. O Mercado Pago avisa o servidor (`POST /api/webhooks/mercadopago`). O aviso só diz "olhe o pagamento número X": o servidor **consulta o pagamento na API com o token** e só acredita nessa resposta. Um aviso forjado não paga nada.
3. O pedido vira `pago` (histórico com origem "pagamento") somente se o pagamento está `approved` **e o valor é exatamente o total do pedido**. Avisos repetidos ou simultâneos pagam uma vez só (linha do pedido travada e `provider_payment_id` único).
4. A página `/pagamento/retorno` mostra a situação **do banco**, nunca o que vem na URL, e se atualiza sozinha enquanto espera (o Pix leva alguns segundos).

Casos que pedem a atenção do dono, e que aparecem no log do servidor: pagamento aprovado com **valor diferente** do pedido (o pedido não é marcado como pago) e pagamento aprovado em pedido **já cancelado** por prazo (as peças já voltaram ao estoque; decida entre reativar à mão ou estornar no Mercado Pago). O estorno é feito no painel do Mercado Pago.

Para testar sem cobrar ninguém: use as credenciais de teste, `MERCADOPAGO_SANDBOX=true` e os cartões de teste da documentação do Mercado Pago. O aviso precisa de um endereço público com https (use um túnel como o do `ngrok` em desenvolvimento).

### Outros pontos de ajuste

| O que | Onde |
| --- | --- |
| Número do WhatsApp da loja (formato `55` + DDD + número) | `src/lib/site.ts` → `whatsappNumber` |
| Nome da marca, descrição e observação de pagamento | `src/lib/site.ts` |
| Catálogo inicial (usado só para popular o banco vazio) | `src/data/products.ts` |
| Fotos dos produtos | pelo painel (`/admin/produtos`); as do catálogo de exemplo ficam em `public/products/` (WebP com fundo transparente, até uns 1600 px) |
| Logo | `public/brand/logo-dark.jpg` |

> O número do WhatsApp atual é um valor de exemplo (`5500000000000`). Troque pelo número real antes de publicar.

### Adicionando um produto

Os produtos ficam na tabela `products` do banco. O arquivo `src/data/products.ts` só popula um banco **vazio**: depois da primeira execução, editá-lo não muda o catálogo.

1. Em `/admin/produtos/novo`, preencha os campos e **escolha a foto** (JPG, PNG ou WebP, até 4 MB). Ela é reduzida (no máximo 1600 px), convertida para WebP e limpa de metadados (EXIF, como a localização do celular) antes de ser guardada no banco e entregue por `/api/images/<id>`: não precisa mexer no projeto nem publicar de novo. Para trocar ou remover a foto depois, edite o produto.
2. Para peça escura em foto com fundo transparente, escolha "Escura" em "Peça da foto". Ela ganha um contorno de luz fino e aparece sobre os cards escuros.

Produto sem foto mostra as iniciais da peça no lugar. As fotos do catálogo de exemplo continuam sendo arquivos de `public/products/`; os dois jeitos convivem. Estoque, ocultar e mostrar na loja são feitos na lista de produtos do painel.

## Estrutura do projeto

```
public/
  brand/              logo da marca
  products/           fotos dos produtos (WebP)
src/
  app/
    (site)/           páginas públicas: home, loja, personalizar, carrinho, sobre, faq, contato
    admin/            painel do dono: login, resumo, pedidos, encomendas, produtos
    api/              rotas de API: produtos, pedidos, encomendas
  components/         componentes de interface
  lib/                código que roda no navegador e no servidor: carrinho, WhatsApp, dinheiro, opções
  server/             só roda no servidor (marcado com server-only)
    db/               conexão, esquema, executor de migrações e dados iniciais
    admin/            autenticação e acesso a dados do painel, por domínio
    catalog.ts        leitura do catálogo, com cache
    orders.ts         pedidos de peças prontas e cancelamento
    custom-orders.ts  encomendas com arte do cliente
```

## Como ler o código

Todo arquivo de código começa com um cabeçalho que diz **o que ele é, quem o usa e em qual tela ou rota ele aparece**. Ao longo do arquivo, cada bloco importante tem um comentário explicando o **porquê** (e não só o quê): a regra de negócio por trás, o cuidado de segurança, a razão de uma escolha que parece estranha. Os comentários estão em português, como o resto do projeto.

Um caminho sugerido para entender o sistema:

1. `src/server/orders.ts`: como um pedido é registrado e o estoque é protegido.
2. `src/proxy.ts`, `src/server/admin/auth.ts` e `src/server/customers/`: como as contas e o painel são protegidos (porteiro, sessão, senha e papel).
3. `src/app/(site)/carrinho/page.tsx` e `src/app/api/orders/route.ts`: o caminho do clique em "Finalizar" até o WhatsApp.
4. `src/app/admin/actions.ts`: tudo o que o dono pode fazer no painel.
5. `tests/`: cada teste explica, em uma frase, a regra que ele garante.

## Rotas

| Rota | Descrição |
| --- | --- |
| `/` | Home: título, arco de produtos, catálogo, como funciona e envio de arte |
| `/loja` | Vitrine de quadrados (foto, nome e preço de cada peça à vista), com busca (`?q=termo`) |
| `/loja/[slug]` | Página de um produto, com lupa para ampliar a estampa |
| `/personalizar` | Encomenda com arte própria: a abertura é a área de soltar o arquivo |
| `/carrinho` | Sacola em forma de recibo, com o fechamento pelo WhatsApp |
| `/sobre` | Sobre a marca, com o processo DTF em quatro etapas |
| `/faq` | Perguntas frequentes em formato de conversa |
| `/contato` | Folha para escrever a mensagem que abre pronta no WhatsApp |
| `/conta/entrar`, `/conta/cadastro` | Entrar e criar conta (a mesma entrada vale para clientes e administradores) |
| `/conta`, `/conta/pedidos`, `/conta/pedidos/[numero]` | A conta, os pedidos do cliente e o comprovante de cada um |
| `/pagamento/retorno` | Situação do pagamento (do próprio cliente) |
| `/privacidade` | Política de privacidade |
| `/admin/*` | Painel do dono (só administradores; para os demais é um 404 comum): resumo, esteira, encomendas, prateleira e caderneta |

## API

As rotas que recebem dados validam a entrada no servidor. No pedido, produto, tamanho, cor e quantidade são conferidos contra o catálogo e o estoque no banco.

**Estoque:** cada tamanho e cor de uma peça tem a sua quantidade (tabela `product_stock`, migração 0010). A baixa é um único `UPDATE` condicional sobre a variação comprada, dentro de uma transação, e a coluna tem `CHECK (stock >= 0)`. O total da peça (`products.stock`) é a soma das variações, mantida por um gatilho do banco: o código nunca o grava, então ele não diverge. No painel, cada peça tem a grade "Estoque por tamanho e cor"; ao tirar um tamanho ou cor da peça, o estoque daquela variação some. Se vários clientes disputam a última peça, só os que couberem no estoque passam e os outros recebem `409`. Em teste local, 12 pedidos simultâneos para 8 peças resultaram em 8 aprovados, 4 recusados e estoque final 0. O cancelamento (`cancelOrder`) devolve as peças ao estoque.

| Método e rota | Função |
| --- | --- |
| `GET /api/products` | Lista os produtos |
| `POST /api/orders` | Exige login **e endereço de entrega** (422 `sem-endereco` sem ele), valida o carrinho, baixa o estoque em transação, registra o pedido com uma cópia do endereço e devolve o link do WhatsApp |
| `GET /api/cep/[cep]` | Só para quem está logado (limite de 30 por 10 min): consulta o CEP no ViaCEP pelo servidor e devolve rua, bairro, cidade e UF |
| `POST /api/custom-orders` | Valida e registra a encomenda personalizada e devolve o link do WhatsApp |

Exemplo:

```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{"items":[{"slug":"oversized-gt3-rs","size":"M","color":"Preta","qty":1}]}'
```

## Identidade visual

- **Cores:** preto e branco como base. O site não usa cor de destaque.
- **Ritmo:** seções de ponta a ponta que alternam blocos pretos e brancos.
- **Tipografia:** Anton em caixa alta nos títulos, em tamanho grande, com fundos de texto que derivam devagar atrás de cada seção. Archivo no texto corrido.
- **Imagens:** as fotos dos produtos usam fundo transparente.

## Estado atual e limitações

O catálogo, o estoque, os pedidos e as encomendas personalizadas já são **persistidos em banco**. Ainda faltam peças para ser um e-commerce completo:

- **Sem recuperação de senha por e-mail:** quem esquece a senha pede ao dono, que gera uma senha provisória em `/admin/clientes` (administradores, pelo `admin:senha`). A recuperação automática precisa de um serviço de e-mail, que ainda não existe.
- **Sem entrar com Google nem link por e-mail:** dependem de contas externas do dono.
- **Fotos no banco:** o upload do painel guarda a imagem no Postgres (até 4 MB de entrada; a foto guardada é reduzida e fica em geral abaixo de 500 KB). Serve bem para um catálogo pequeno; se o volume crescer, migrar para um armazenamento de arquivos como o Vercel Blob. Prefira fotos já otimizadas (WebP).
- **Pagamento online ainda não testado contra o Mercado Pago real:** a integração foi validada com a API simulada. O formato da assinatura do aviso (`x-signature`) precisa ser conferido com o botão "Simular" do painel deles antes de publicar. Sem `MERCADOPAGO_ACCESS_TOKEN`, Pix e cartão seguem combinados no WhatsApp e o pedido nasce `pendente`.
- **Sem estorno pelo painel:** estornos e disputas são feitos no painel do Mercado Pago.
- **Desconto no Pix depende de conferência no Mercado Pago real:** a página "só Pix" exclui todos os outros tipos de pagamento (cartões, boleto, caixa eletrônico, saldo) e o aviso confirma que o pagamento foi por `bank_transfer`; os identificadores dos tipos foram escritos da documentação e precisam ser testados com o botão "Simular" e um Pix de teste.
- **Listas grandes:** a esteira carrega cada coluna por conta própria (pedidos em aberto aparecem sempre, até 100 por coluna; entregues e cancelados mostram os 20 mais recentes e abrem com paginação de 40), com os totais de todos os pedidos; a Caderneta pagina de 100 em 100. A busca usa `ILIKE` (sem índice de texto): serve bem para milhares de linhas; muito além disso, vale um índice `pg_trgm` no Neon.
- **SEO:** cada peça tem título, descrição (até 160 caracteres), endereço canônico, imagem de compartilhamento (a foto da peça; as demais páginas usam a imagem padrão gerada em `opengraph-image.tsx`) e dados estruturados `Product` (preço em BRL e disponibilidade) para o Google. **`SITE_URL` precisa existir também durante o build** (na Vercel ela já vale no build): as páginas são geradas então, e sem ela os endereços saem como `localhost`. No computador, `next build` abre o banco embutido em vários processos ao mesmo tempo e pode corrompê-lo: use `PGLITE_DIR` apontando para uma pasta temporária ao construir.
- **Pedido pendente segura as peças por tempo limitado:** a baixa acontece quando o pedido é registrado. Pedido com cobrança online (Mercado Pago) segura por 12 horas (`PRAZO_ONLINE_HORAS`, o mesmo prazo de validade da cobrança) e pedido combinado só pelo WhatsApp por 48 horas (`PENDING_ORDER_HOURS`). O cron diário cancela os vencidos e, além disso, uma compra que falha por falta de estoque libera os pedidos vencidos na hora e tenta de novo. Não há aviso ao cliente antes de expirar.
- **Sem cálculo de frete:** previsto para a etapa 3 (Correios, com plano B no WhatsApp). Precisa de contrato com os Correios.
- **Um endereço por conta:** quem entrega em mais de um lugar troca o endereço antes de cada compra (cada pedido guarda o seu).
- **Neon ainda não testado:** o caminho de produção usa o driver serverless do Neon, mas foi validado apenas contra o Postgres embutido. Teste com um banco Neon real antes de publicar.
- **Catálogo de exemplo:** nomes, preços e estoque são de exemplo e devem ser substituídos pelos reais.

## Próximos passos

1. Provisionar o Neon na Vercel (precisa da conta do dono) e testar contra o banco real.
2. Trocar o número de WhatsApp de exemplo em `src/lib/site.ts` pelo número da loja.
3. Criar a conta e a aplicação no Mercado Pago, cadastrar o aviso e testar o pagamento com as credenciais de teste.
4. Criar o primeiro administrador em produção (`npm run admin:criar`) e definir `CUSTOMER_SESSION_SECRET` na Vercel.
5. Cálculo de frete pelos Correios (etapa 3, precisa de contrato com os Correios).
6. Serviço de e-mail, para recuperação de senha.

## Direitos de imagem

As fotos em `public/products/` e as artes estampadas nelas devem pertencer à loja ou ter autorização de uso. Confirme os direitos antes de vender os produtos.
