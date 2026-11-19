import { boolean, index, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

// Preços sempre em centavos (inteiro), para nunca ter erro de arredondamento com dinheiro.

export const products = pgTable("products", {
  slug: text("slug").primaryKey(),
  name: text("name").notNull(),
  priceCents: integer("price_cents").notNull(),
  description: text("description").notNull().default(""),
  category: text("category").notNull(),
  sizes: jsonb("sizes").$type<string[]>().notNull(),
  colors: jsonb("colors").$type<string[]>().notNull(),
  stock: integer("stock").notNull().default(0),
  image: text("image"),
  photoBg: text("photo_bg"),
  active: boolean("active").notNull().default(true),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ORDER_STATUS = ["pendente", "pago", "enviado", "entregue", "cancelado"] as const;
export type OrderStatus = (typeof ORDER_STATUS)[number];

export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    status: text("status").$type<OrderStatus>().notNull().default("pendente"),
    totalCents: integer("total_cents").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("orders_status_idx").on(t.status), index("orders_created_idx").on(t.createdAt)],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: serial("id").primaryKey(),
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

export const customOrders = pgTable(
  "custom_orders",
  {
    id: serial("id").primaryKey(),
    status: text("status").notNull().default("novo"),
    name: text("name").notNull().default(""),
    model: text("model").notNull(),
    color: text("color").notNull(),
    size: text("size").notNull(),
    placement: text("placement").notNull(),
    notes: text("notes").notNull().default(""),
    fileName: text("file_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("custom_orders_created_idx").on(t.createdAt)],
);

export type ProductRow = typeof products.$inferSelect;

// Tentativas de login que falharam, por origem. Ficam no banco para valer entre instâncias do servidor.
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: serial("id").primaryKey(),
    key: text("key").notNull(),
    failedAt: timestamp("failed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("login_attempts_key_idx").on(t.key, t.failedAt)],
);
