import { pgTable, serial, timestamp, boolean, integer, decimal } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { storesTable } from "./stores";
import { productsTable } from "./products";

export const cartsTable = pgTable("carts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }).unique(),
  storeId: integer("store_id").references(() => storesTable.id),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const cartItemsTable = pgTable("cart_items", {
  id: serial("id").primaryKey(),
  cartId: integer("cart_id").notNull().references(() => cartsTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => productsTable.id),
  qty: integer("qty").notNull().default(1),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  addedAt: timestamp("added_at").notNull().defaultNow(),
});

export const wishlistTable = pgTable("wishlist", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
  addedAt: timestamp("added_at").notNull().defaultNow(),
});

export const insertCartItemSchema = createInsertSchema(cartItemsTable).omit({ id: true, addedAt: true });
export type Cart = typeof cartsTable.$inferSelect;
export type CartItem = typeof cartItemsTable.$inferSelect;
export type InsertCartItem = z.infer<typeof insertCartItemSchema>;
