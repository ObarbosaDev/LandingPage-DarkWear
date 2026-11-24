// ============================================================================
// Descrição das tabelas do banco (o "mapa" que o Drizzle usa para consultar com tipos).
//
// Importante: este arquivo DESCREVE as tabelas para o código; quem de fato cria/altera as tabelas
// no banco são as migrações (src/server/db/migrations.ts). Mudou aqui? Crie também uma migração.
// ============================================================================

import { boolean, customType, index, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

// Coluna de bytes (bytea): o Drizzle não traz pronta. O Neon devolve Buffer e o PGlite devolve
// Uint8Array; os dois são normalizados para Uint8Array.
const bytea = customType<{ data: Uint8Array; driverData: Uint8Array | Buffer }>({
  dataType: () => "bytea",
  fromDriver: (v) => new Uint8Array(v),
});

// Preços sempre em centavos (inteiro), para nunca ter erro de arredondamento com dinheiro.

// ---------------------------------------------------------------------------
// products: o catálogo da loja.
// Lida na vitrine (home, /loja, /loja/[slug]) e editada no painel (/admin/produtos).
// ---------------------------------------------------------------------------
export const products = pgTable("products", {
  // O "slug" é o endereço da peça (/loja/oversized-gt3-rs) e também a chave primária.
  slug: text("slug").primaryKey(),
  name: text("name").notNull(),
  priceCents: integer("price_cents").notNull(),
  description: text("description").notNull().default(""),
  // "Pronta entrega" ou "Coleção" (filtro da loja).
  category: text("category").notNull(),
  // Listas guardadas como JSON, ex.: ["P","M","G"]. O $type dá o tipo certo ao código.
  sizes: jsonb("sizes").$type<string[]>().notNull(),
  colors: jsonb("colors").$type<string[]>().notNull(),
  // Peças disponíveis. A baixa é feita por pedido, de forma atômica (ver src/server/orders.ts).
  stock: integer("stock").notNull().default(0),
  // Caminho da foto: um arquivo de /public (ex.: /products/porsche-gt3.webp) ou uma foto enviada pelo
  // painel (/api/images/<id>, ver product_images). Vazio = mostra as iniciais.
  image: text("image"),
  // "light" = peça escura em foto transparente (ganha contorno de luz); "dark" = peça clara.
  photoBg: text("photo_bg"),
  // false = oculto da loja (o dono pode esconder sem apagar).
  active: boolean("active").notNull().default(true),
  // Ordem de exibição (menor primeiro).
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Estados possíveis de um pedido, na ordem natural do fluxo. As transições permitidas ficam em
// src/server/admin/orders.ts (NEXT_STATUS).
export const ORDER_STATUS = ["pendente", "pago", "enviado", "entregue", "cancelado"] as const;
export type OrderStatus = (typeof ORDER_STATUS)[number];

// ---------------------------------------------------------------------------
// customers: as contas de cliente (migração 0007). Comprar exige conta.
// Nunca guarda a senha, só o hash. O e-mail é único e sempre em minúsculas (o banco confere).
// "sessionVersion" invalida os cookies antigos; "anonymizedAt" marca a conta excluída (dados
// pessoais apagados, pedidos mantidos).
// ---------------------------------------------------------------------------
export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  // Só dígitos (DDD + número, 10 ou 11), ou vazio em conta anonimizada.
  phone: text("phone").notNull(),
  passwordHash: text("password_hash").notNull(),
  sessionVersion: integer("session_version").notNull().default(1),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  // "cliente" (todo mundo) ou "admin" (quem administra a loja). Só um comando de terminal do dono concede
  // "admin"; nenhuma tela ou API escreve este campo (migração 0008).
  role: text("role").$type<"cliente" | "admin">().notNull().default("cliente"),
  privacyAcceptedAt: timestamp("privacy_accepted_at", { withTimezone: true }).notNull(),
  anonymizedAt: timestamp("anonymized_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// orders: o cabeçalho de cada pedido de peças prontas (criado em /carrinho → POST /api/orders).
// ---------------------------------------------------------------------------
export const orders = pgTable(
  "orders",
  {
    // O número do pedido mostrado ao cliente (DW-00001) vem deste id.
    id: serial("id").primaryKey(),
    status: text("status").$type<OrderStatus>().notNull().default("pendente"),
    // Total já calculado pelo servidor (o cliente não consegue alterar).
    totalCents: integer("total_cents").notNull(),
    // Quem comprou. Nulo só nos pedidos antigos, feitos antes de existir cadastro.
    customerId: integer("customer_id").references(() => customers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // Índices: aceleram a listagem do painel por status e a ordenação por data.
  // Os índices reais (compostos e parciais) são criados nas migrações 0001 e 0003; aqui ficam os
  // equivalentes para o Drizzle conhecer a estrutura.
  (t) => [index("orders_status_created_idx").on(t.status, t.createdAt), index("orders_created_idx").on(t.createdAt)],
);

// ---------------------------------------------------------------------------
// order_items: cada linha de um pedido (qual peça, tamanho, cor e quantidade).
// ---------------------------------------------------------------------------
export const orderItems = pgTable(
  "order_items",
  {
    id: serial("id").primaryKey(),
    // Se o pedido for apagado, as linhas dele vão junto (cascade).
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productSlug: text("product_slug").notNull(),
    // Nome e preço copiados no momento da compra: o pedido não muda se o catálogo mudar.
    name: text("name").notNull(),
    size: text("size").notNull(),
    color: text("color").notNull(),
    qty: integer("qty").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
  },
  (t) => [index("order_items_order_idx").on(t.orderId)],
);

// ---------------------------------------------------------------------------
// custom_orders: encomendas com a arte do cliente (criadas em /personalizar).
// O arquivo da arte NÃO fica aqui: o cliente o anexa no WhatsApp; guardamos só o nome dele.
// ---------------------------------------------------------------------------
export const customOrders = pgTable(
  "custom_orders",
  {
    id: serial("id").primaryKey(),
    // Fluxo próprio do atendimento: novo, em contato, produzindo, concluído, cancelado.
    status: text("status").notNull().default("novo"),
    name: text("name").notNull().default(""),
    model: text("model").notNull(),
    color: text("color").notNull(),
    size: text("size").notNull(),
    // Onde a arte vai na peça: peito, frente, costas ou manga.
    placement: text("placement").notNull(),
    notes: text("notes").notNull().default(""),
    fileName: text("file_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("custom_orders_created_idx").on(t.createdAt)],
);

// Uma linha da tabela de produtos, como o painel a lê (inclui campos que a vitrine não usa).
export type ProductRow = typeof products.$inferSelect;

// ---------------------------------------------------------------------------
// login_attempts: tentativas de login do painel que falharam, por origem.
// Usada em src/server/admin/auth.ts para bloquear quem erra a senha várias vezes.
// Ficam no banco (e não na memória) para valer entre todas as instâncias do servidor.
// ---------------------------------------------------------------------------
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: serial("id").primaryKey(),
    key: text("key").notNull(),
    failedAt: timestamp("failed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("login_attempts_key_idx").on(t.key, t.failedAt)],
);

// ---------------------------------------------------------------------------
// rate_limits: contador de requisições por origem e por tipo ("bucket").
// Usada em src/server/rate-limit.ts para limitar quantos pedidos/encomendas uma origem faz.
// ---------------------------------------------------------------------------
export const rateLimits = pgTable(
  "rate_limits",
  {
    id: serial("id").primaryKey(),
    // Tipo da chamada limitada ("orders", "custom-orders"): cada tipo tem a sua conta.
    bucket: text("bucket").notNull(),
    // Quem fez a chamada (endereço de origem).
    key: text("key").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("rate_limits_idx").on(t.bucket, t.key, t.at)],
);

// ---------------------------------------------------------------------------
// order_status_history: o histórico de status dos pedidos (migração 0004).
// Uma linha a cada mudança: de qual status, para qual, quando e por quem (origin):
//   "pedido" = o cliente criou o pedido; "painel" = o dono mudou; "expiracao" = o cron cancelou por prazo;
//   "pagamento" = o Mercado Pago avisou (webhook) que o pagamento foi aprovado.
// ---------------------------------------------------------------------------
export const orderStatusHistory = pgTable(
  "order_status_history",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    // null na primeira linha de cada pedido (nasceu agora, não veio de nenhum status).
    fromStatus: text("from_status").$type<OrderStatus>(),
    toStatus: text("to_status").$type<OrderStatus>().notNull(),
    origin: text("origin").$type<StatusOrigin>().notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("order_status_history_order_idx").on(t.orderId, t.at)],
);

// De onde veio uma mudança de status (ver order_status_history).
export const STATUS_ORIGIN = ["pedido", "painel", "expiracao", "pagamento"] as const;
export type StatusOrigin = (typeof STATUS_ORIGIN)[number];

// ---------------------------------------------------------------------------
// payments: os pagamentos online dos pedidos (migração 0005), hoje só do Mercado Pago.
// Uma linha nasce "iniciado" quando o cliente é levado à página de pagamento e é atualizada pelos
// avisos (webhook) do Mercado Pago. O status aqui é o NOSSO, já traduzido do deles (ver
// src/server/payments/mercadopago.ts).
// ---------------------------------------------------------------------------
export const PAYMENT_STATUS = ["iniciado", "pendente", "aprovado", "recusado", "cancelado", "estornado"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUS)[number];

export const payments = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    provider: text("provider").$type<"mercadopago">().notNull(),
    // Identifica a "página de pagamento" criada para o pedido (a preferência do Mercado Pago).
    preferenceId: text("preference_id"),
    // Identifica o pagamento de fato. Único: o mesmo aviso repetido cai na mesma linha.
    providerPaymentId: text("provider_payment_id").unique(),
    status: text("status").$type<PaymentStatus>().notNull(),
    // Forma de pagamento (credit_card, debit_card, pix...), como o Mercado Pago informa.
    method: text("method"),
    installments: integer("installments"),
    // Valor cobrado, em centavos. É conferido com o total do pedido antes de marcá-lo como pago.
    amountCents: integer("amount_cents"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("payments_order_idx").on(t.orderId), index("payments_preference_idx").on(t.preferenceId)],
);

// ---------------------------------------------------------------------------
// product_images: as fotos de produto enviadas pelo painel (migração 0006).
// Cada foto enviada é uma linha nova e nunca é alterada; a rota /api/images/<id> a entrega.
// ---------------------------------------------------------------------------
export const productImages = pgTable("product_images", {
  id: serial("id").primaryKey(),
  contentType: text("content_type").$type<"image/jpeg" | "image/png" | "image/webp">().notNull(),
  data: bytea("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
