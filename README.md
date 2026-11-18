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

Nenhuma variável de ambiente é necessária hoje. Os pontos que a loja precisa ajustar ficam em poucos arquivos:

| O que | Onde |
| --- | --- |
| Número do WhatsApp da loja (formato `55` + DDD + número) | `src/lib/site.ts` → `whatsappNumber` |
| Nome da marca, descrição e observação de pagamento | `src/lib/site.ts` |
| Produtos, preços, tamanhos, cores e estoque | `src/data/products.ts` |
| Fotos dos produtos | `public/products/` (PNG com fundo transparente) |
| Logo | `public/brand/logo-dark.jpg` |

> O número do WhatsApp atual é um valor de exemplo (`5500000000000`). Troque pelo número real antes de publicar.

### Adicionando um produto

1. Coloque a foto em `public/products/`.
2. Acrescente um item em `src/data/products.ts` com `slug`, `name`, `price`, `description`, `category`, `sizes`, `colors`, `stock` e `image`.
3. Para peça escura em foto com fundo transparente, use `photoBg: "light"`. Ela ganha um contorno de luz fino e aparece sobre os cards escuros.

Produto sem `image` mostra uma camiseta desenhada no lugar da foto.

## Estrutura do projeto

```
public/
  brand/            logo da marca
  products/         fotos dos produtos
src/
  app/              rotas, layout e estilos globais
    api/            rotas de API (produtos, pedidos, encomendas)
    loja/           catálogo e página de produto
    personalizar/   encomenda com a arte do cliente
    carrinho/       carrinho e fechamento pelo WhatsApp
  components/       componentes de interface
  data/             catálogo de produtos
  lib/              regras de negócio (carrinho, pedidos, WhatsApp, marca)
```

## Rotas

| Rota | Descrição |
| --- | --- |
| `/` | Home: título, arco de produtos, catálogo, como funciona e envio de arte |
| `/loja` | Catálogo completo, com busca (`?q=termo`) |
| `/loja/[slug]` | Página de um produto |
| `/personalizar` | Encomenda com arte própria |
| `/carrinho` | Carrinho e finalização |
| `/sobre` | Sobre a marca |
| `/faq` | Perguntas frequentes |
| `/contato` | Contato por WhatsApp |

## API

As rotas que recebem dados validam a entrada no servidor. No pedido, produto, tamanho, cor e quantidade são conferidos contra o catálogo e o estoque.

| Método e rota | Função |
| --- | --- |
| `GET /api/products` | Lista os produtos |
| `POST /api/orders` | Valida o carrinho, registra o pedido e devolve o link do WhatsApp |
| `POST /api/custom-orders` | Valida a encomenda personalizada e devolve o link do WhatsApp |

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

Este projeto é a vitrine e o fluxo de pedido. Ainda **não é** um e-commerce completo:

- **Pedidos em memória:** os pedidos registrados em `/api/orders` ficam na memória do servidor e se perdem a cada reinício. Não há banco de dados.
- **Sem pagamento online:** Pix e cartão são combinados no WhatsApp.
- **Sem cálculo de frete.**
- **Sem painel administrativo:** produtos e estoque são editados no código.
- **Sem contas de cliente:** a compra é sem cadastro.
- **Catálogo de exemplo:** nomes, preços e estoque em `src/data/products.ts` são de exemplo e devem ser substituídos pelos reais.

## Próximos passos

1. Trocar os dados de exemplo pelos produtos, preços e estoque reais.
2. Persistir pedidos e estoque (banco de dados ou plataforma de comércio).
3. Pagamento online com Pix e cartão e cálculo de frete.
4. Painel para o dono gerenciar produtos e pedidos.
5. Área "Meus pedidos", opcional e sem cadastro obrigatório.

## Direitos de imagem

As fotos em `public/products/` e as artes estampadas nelas devem pertencer à loja ou ter autorização de uso. Confirme os direitos antes de vender os produtos.
