import { pgTable, serial, text, varchar, timestamp, integer, decimal, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { productsTable } from "./products";
import { ordersTable } from "./orders";

export const reviewsTable = pgTable("reviews", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
  orderId: integer("order_id").references(() => ordersTable.id),
  rating: integer("rating").notNull(), // 1-5
  title: varchar("title", { length: 255 }),
  body: text("body"),
  images: json("images").$type<string[]>().default([]),
  helpfulCount: integer("helpful_count").default(0),
  isVerifiedPurchase: integer("is_verified_purchase").default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertReviewSchema = createInsertSchema(reviewsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type Review = typeof reviewsTable.$inferSelect;
export type InsertReview = z.infer<typeof insertReviewSchema>;
