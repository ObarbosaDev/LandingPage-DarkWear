# DarkWear

Loja online de camisetas estampadas em DTF. O cliente escolhe uma peça pronta do estoque ou envia a própria arte para produzir sob encomenda. O preço e o prazo são combinados pelo WhatsApp antes de qualquer pagamento.

## Sumário

- [Funcionalidades](#funcionalidades)
- [Stack](#stack)
- [Como rodar](#como-rodar)
- [Configuração](#configuração)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Rotas](#rotas)
- [API](#api)
- [Identidade visual](#identidade-visual)
- [Estado atual e limitações](#estado-atual-e-limitações)
- [Próximos passos](#próximos-passos)

## Funcionalidades

- **Catálogo:** vitrine na home com filtro por categoria (Todos, Pronta entrega, Coleção) e busca por nome na loja.
- **Arco de produtos:** carrossel 3D de cards na home. Arrasta com o mouse, rola com a roda, usa as setas ou clica no card.
- **Página de produto:** foto, descrição, escolha de tamanho e cor, com controle pelo estoque disponível.
- **Carrinho:** persiste no navegador (`localStorage`) e fecha o pedido pelo WhatsApp com uma mensagem já montada.
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

## Configuração

### Banco de dados

Em desenvolvimento não é preciso configurar nada: sem `DATABASE_URL`, o projeto usa um Postgres embutido (PGlite), gravado em `.data/pglite` e ignorado pelo git. Na primeira execução o catálogo é carregado de `src/data/products.ts` para o banco. Para recomeçar do zero em desenvolvimento, apague a pasta `.data`.

| Variável | Para que serve |
| --- | --- |
| `DATABASE_URL` | Conexão com o Postgres de produção (Neon). Na Vercel, o Marketplace cria o banco e injeta essa variável. |
| `PGLITE_DIR` | Opcional. Troca a pasta do banco local (padrão `./.data/pglite`). |

### Painel do dono

O painel fica em `/admin` e protege tudo com uma senha única.

| Variável | Para que serve |
| --- | --- |
| `ADMIN_PASSWORD` | Senha de entrada do painel. |
| `ADMIN_SESSION_SECRET` | Segredo que assina o cookie de sessão (mínimo de 32 caracteres, aleatório). |

Copie `.env.example` para `.env.local` e preencha as duas. Sem elas, o painel não abre. A sessão dura 12 horas, o cookie é `httpOnly` e `sameSite=strict`, e cada página e cada ação conferem a sessão. O login tem limite de 5 erros em 15 minutos por origem, guardado no banco (vale entre instâncias). A origem vem do cabeçalho que a hospedagem define (`x-vercel-forwarded-for` ou `x-real-ip`); fora de uma hospedagem assim, todos compartilham a mesma origem.

Na Vercel, sem `DATABASE_URL` a aplicação falha com uma mensagem clara, em vez de usar um banco que se perderia a cada execução.

### Outros pontos de ajuste

| O que | Onde |
| --- | --- |
| Número do WhatsApp da loja (formato `55` + DDD + número) | `src/lib/site.ts` → `whatsappNumber` |
| Nome da marca, descrição e observação de pagamento | `src/lib/site.ts` |
| Catálogo inicial (usado só para popular o banco vazio) | `src/data/products.ts` |
| Fotos dos produtos | `public/products/` (PNG com fundo transparente) |
| Logo | `public/brand/logo-dark.jpg` |

> O número do WhatsApp atual é um valor de exemplo (`5500000000000`). Troque pelo número real antes de publicar.

### Adicionando um produto

Os produtos ficam na tabela `products` do banco. O arquivo `src/data/products.ts` só popula um banco **vazio**: depois da primeira execução, editá-lo não muda o catálogo.

1. Coloque a foto em `public/products/`.
2. Em `/admin/produtos/novo`, preencha os campos e informe o caminho da foto (por exemplo `/products/arquivo.png`).
3. Para peça escura em foto com fundo transparente, escolha "Escura" em "Peça da foto". Ela ganha um contorno de luz fino e aparece sobre os cards escuros.

Produto sem foto mostra uma camiseta desenhada no lugar. Estoque, ocultar e mostrar na loja são feitos na lista de produtos do painel.

## Estrutura do projeto

```
public/
  brand/            logo da marca
  products/         fotos dos produtos
src/
  app/              rotas, layout e estilos globais
    (site)/         páginas públicas (home, loja, personalizar, carrinho, institucionais)
    admin/          painel do dono (login, pedidos, encomendas, produtos)
    api/            rotas de API (produtos, pedidos, encomendas)
  components/       componentes de interface
  data/             catálogo de produtos
  lib/              regras de negócio (carrinho, pedidos, WhatsApp, marca)
```

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
- **Sem upload de foto no painel:** a foto é um arquivo em `public/products/` e o painel recebe só o caminho. Upload direto exigiria um armazenamento como o Vercel Blob.
- **Sem pagamento online:** Pix e cartão são combinados no WhatsApp. O pedido nasce como `pendente`.
- **Estoque reservado sem prazo:** a baixa acontece quando o pedido é registrado. Pedido que nunca é pago segura a peça até alguém cancelar. Falta expirar pedidos pendentes.
- **Sem cálculo de frete.**
- **Sem contas de cliente:** a compra é sem cadastro.
- **Esquema sem migrações versionadas:** o esquema é criado por SQL idempotente (`src/db/ddl.ts`). Antes de mudar tabelas com dados reais em produção, adotar migrações (drizzle-kit).
- **Neon ainda não testado:** o caminho de produção usa o driver serverless do Neon, mas foi validado apenas contra o Postgres embutido. Teste com um banco Neon real antes de publicar.
- **Catálogo de exemplo:** nomes, preços e estoque são de exemplo e devem ser substituídos pelos reais.

## Próximos passos

1. Upload de fotos pelo painel.
2. Pagamento online com Pix e cartão, com confirmação automática (webhook) mudando o pedido para `pago`.
3. Expiração de pedidos pendentes, devolvendo o estoque.
4. Cálculo de frete.
5. Migrações versionadas e banco Neon provisionado na Vercel.
6. Área "Meus pedidos", opcional e sem cadastro obrigatório.

## Direitos de imagem

As fotos em `public/products/` e as artes estampadas nelas devem pertencer à loja ou ter autorização de uso. Confirme os direitos antes de vender os produtos.
