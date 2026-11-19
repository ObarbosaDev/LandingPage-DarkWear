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
- **Página de produto:** foto, descrição, escolha de tamanho e cor, com controle pelo estoque disponível.
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

### Painel do dono

O painel fica em `/admin` e protege tudo com uma senha única.

| Variável | Para que serve |
| --- | --- |
| `ADMIN_PASSWORD` | Senha de entrada do painel. |
| `ADMIN_SESSION_SECRET` | Segredo que assina o cookie de sessão (mínimo de 32 caracteres, aleatório). |

Copie `.env.example` para `.env.local` e preencha as duas. Sem elas, o painel não abre. A sessão dura 12 horas, o cookie é `httpOnly` e `sameSite=strict`, e cada página e cada ação conferem a sessão. O login tem limite de 5 erros em 15 minutos por origem, guardado no banco (vale entre instâncias). A origem vem do cabeçalho que a hospedagem define (`x-vercel-forwarded-for` ou `x-real-ip`); fora de uma hospedagem assim, todos compartilham a mesma origem.

Na Vercel, sem `DATABASE_URL` a aplicação falha com uma mensagem clara, em vez de usar um banco que se perderia a cada execução.

### Pagamento online (Mercado Pago)

O pagamento online é **opcional**: sem `MERCADOPAGO_ACCESS_TOKEN`, o site fecha pedidos só pelo WhatsApp, como antes. Com ele, a sacola ganha o botão "Pagar com cartão ou Pix".

**O cartão nunca passa por este site.** O cliente é levado à página de pagamento do próprio Mercado Pago (Checkout Pro) e digita o cartão lá. O site só cria a cobrança e recebe o aviso do resultado, então não há dado de cartão para proteger nem certificação PCI a cumprir. Crédito, débito e Pix ficam disponíveis; o boleto fica de fora de propósito, porque leva dias para compensar e seguraria as peças no estoque.

| Variável | Para que serve |
| --- | --- |
| `MERCADOPAGO_ACCESS_TOKEN` | Liga o pagamento online. Vem do painel de desenvolvedores do Mercado Pago. Nunca vai ao navegador. |
| `MERCADOPAGO_WEBHOOK_SECRET` | Assinatura secreta dos avisos (Suas integrações > Webhooks). Sem ela, os avisos não têm a assinatura conferida. |
| `MERCADOPAGO_MAX_INSTALLMENTS` | Máximo de parcelas no cartão, de 1 a 12. Padrão 1 (à vista), porque parcelar tem custo para a loja. |
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

1. Em `/admin/produtos/novo`, preencha os campos e **escolha a foto** (JPG, PNG ou WebP, até 2 MB). Ela é guardada no banco e entregue por `/api/images/<id>`: não precisa mexer no projeto nem publicar de novo. Para trocar ou remover a foto depois, edite o produto.
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
2. `src/server/admin/auth.ts`: como o painel do dono é protegido.
3. `src/app/(site)/carrinho/page.tsx` e `src/app/api/orders/route.ts`: o caminho do clique em "Finalizar" até o WhatsApp.
4. `src/app/admin/actions.ts`: tudo o que o dono pode fazer no painel.
5. `tests/`: cada teste explica, em uma frase, a regra que ele garante.

## Rotas

| Rota | Descrição |
| --- | --- |
| `/` | Home: título, arco de produtos, catálogo, como funciona e envio de arte |
| `/loja` | Catálogo em índice tipográfico, com filtro por categoria, busca (`?q=termo`) e a foto da peça seguindo o mouse |
| `/loja/[slug]` | Página de um produto, com lupa para ampliar a estampa |
| `/personalizar` | Encomenda com arte própria: a abertura é a área de soltar o arquivo |
| `/carrinho` | Sacola em forma de recibo, com o fechamento pelo WhatsApp |
| `/sobre` | Sobre a marca, com o processo DTF em quatro etapas |
| `/faq` | Perguntas frequentes em formato de conversa |
| `/contato` | Folha para escrever a mensagem que abre pronta no WhatsApp |
| `/admin` | Painel do dono (exige senha): resumo, pedidos, encomendas e produtos |

## API

As rotas que recebem dados validam a entrada no servidor. No pedido, produto, tamanho, cor e quantidade são conferidos contra o catálogo e o estoque no banco.

**Estoque:** a baixa é um único `UPDATE` condicional dentro de uma transação, e a coluna tem `CHECK (stock >= 0)`. Se vários clientes disputam a última peça, só os que couberem no estoque passam e os outros recebem `409`. Em teste local, 12 pedidos simultâneos para 8 peças resultaram em 8 aprovados, 4 recusados e estoque final 0. O cancelamento (`cancelOrder`) devolve as peças ao estoque.

| Método e rota | Função |
| --- | --- |
| `GET /api/products` | Lista os produtos |
| `POST /api/orders` | Valida o carrinho, baixa o estoque em transação, registra o pedido e devolve o link do WhatsApp |
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

- **Painel simples:** senha única, sem vários usuários nem recuperação de senha (para isso, migrar para um provedor como o Clerk).
- **Fotos no banco:** o upload do painel guarda a imagem no Postgres (até 2 MB, sem redimensionar). Serve bem para um catálogo pequeno; se o volume crescer, migrar para um armazenamento de arquivos como o Vercel Blob. Prefira fotos já otimizadas (WebP).
- **Pagamento online ainda não testado contra o Mercado Pago real:** a integração foi validada com a API simulada. O formato da assinatura do aviso (`x-signature`) precisa ser conferido com o botão "Simular" do painel deles antes de publicar. Sem `MERCADOPAGO_ACCESS_TOKEN`, Pix e cartão seguem combinados no WhatsApp e o pedido nasce `pendente`.
- **Sem estorno pelo painel:** estornos e disputas são feitos no painel do Mercado Pago.
- **Pedido pendente expira só por prazo fixo:** a baixa acontece quando o pedido é registrado, e o cron cancela os pendentes depois de 48 horas. Não há aviso ao cliente nem prazo por pedido.
- **Sem cálculo de frete.**
- **Sem contas de cliente:** a compra é sem cadastro.
- **Neon ainda não testado:** o caminho de produção usa o driver serverless do Neon, mas foi validado apenas contra o Postgres embutido. Teste com um banco Neon real antes de publicar.
- **Catálogo de exemplo:** nomes, preços e estoque são de exemplo e devem ser substituídos pelos reais.

## Próximos passos

1. Provisionar o Neon na Vercel (precisa da conta do dono) e testar contra o banco real.
2. Trocar o número de WhatsApp de exemplo em `src/lib/site.ts` pelo número da loja.
3. Criar a conta e a aplicação no Mercado Pago, cadastrar o aviso e testar o pagamento com as credenciais de teste.
4. Mostrar o pagamento (forma, parcelas) em cada pedido do painel.
5. Cálculo de frete.
6. Área "Meus pedidos", opcional e sem cadastro obrigatório.

## Direitos de imagem

As fotos em `public/products/` e as artes estampadas nelas devem pertencer à loja ou ter autorização de uso. Confirme os direitos antes de vender os produtos.
