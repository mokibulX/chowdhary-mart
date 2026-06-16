# Chowdhary Mart

A production-grade hyperlocal e-commerce platform (Flipkart + Blinkit + Rapido style) with customer app, vendor panel, delivery partner panel, and admin panel — all fully functional with real backend, real DB, and JWT auth.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, path `/api`)
- `pnpm --filter @workspace/web run dev` — run the customer/vendor/admin web app (port 22333, path `/`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string, `SESSION_SECRET` — JWT secret

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 (port 8080, routed at `/api`)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec → React Query hooks)
- Frontend: React 19 + Vite + Tailwind CSS + shadcn/ui + wouter (routing)
- Auth: JWT-based with bcryptjs. `SESSION_SECRET` env var.
- Build: esbuild (CJS bundle for API)

## Where things live

- `artifacts/api-server/src/` — Express API server
  - `routes/` — all route handlers (auth, products, cart, orders, tracking, vendor, admin, etc.)
  - `middleware/auth.ts` — JWT middleware
  - `lib/auth.ts` — JWT sign/verify helpers
- `artifacts/web/src/` — React frontend
  - `pages/` — customer pages (Home, Search, Store, ProductDetail, Cart, Checkout, Orders, Track, Wishlist, Profile, Addresses, Wallet, Coupons, Notifications)
  - `pages/vendor/` — vendor panel (VendorDashboard, VendorOrders, VendorProducts, VendorStore)
  - `pages/admin/` — admin panel (AdminDashboard, AdminUsers, AdminOrders, AdminStores, AdminCoupons)
  - `components/layout/` — CustomerLayout, VendorLayout, AdminLayout
  - `components/ProductCard.tsx` — shared add-to-cart product card
  - `hooks/use-auth.tsx` — AuthContext with user/token/login/logout
- `lib/db/` — Drizzle ORM schema and migrations
- `lib/api-spec/` — OpenAPI spec (source of truth for API contract)
- `lib/api-client-react/` — generated React Query hooks and Zod schemas

## Demo Users (all password: `password123`)

| Email | Role |
|-------|------|
| admin@chowdharymart.com | admin |
| vendor@chowdharymart.com | vendor |
| demo@customer.com | customer |
| delivery@chowdharymart.com | delivery_partner |

## Seeded Data

- 10 categories (Fruits & Vegetables, Dairy & Breakfast, Snacks, Beverages, Household, Personal Care, Staples, Frozen, Baby Care, Pet Supplies)
- 2 stores (Chowdhary Fresh — Connaught Place, Lajpat Nagar Fresh)
- 20 products with real prices, discounts, and images
- 5 coupons (WELCOME50, SAVE30, FREESHIP, etc.)
- 3 promotional banners

## Architecture decisions

- Contract-first API: OpenAPI spec → Orval generates typed React Query hooks. Never call API endpoints directly in the frontend.
- JWT in localStorage with `setAuthTokenGetter` wired to the Orval-generated `customFetch`. Import `setAuthTokenGetter` from `@workspace/api-client-react` (not a deep path).
- Role-based routing: `RequireAuth` wrapper with `roles` prop gates vendor/admin panels. Unauthorized users get redirected to `/`.
- Enum comparisons in API routes use `as typeof table.$inferSelect["field"]` cast to satisfy TypeScript without runtime overhead.
- All money values stored as `numeric` in DB and returned as strings; always parse with `Number()` before displaying.

## Product

- **Customer app**: Home (banners, categories, stores, featured products), Search (filter + sort), Store detail, Product detail (images, reviews, add-to-cart, wishlist), Cart (coupon apply, quantity, bill summary), Checkout (address, payment method, wallet toggle), Orders list + detail, Live order tracking, Wishlist, Profile, Saved addresses, Wallet & transactions, Coupons, Notifications
- **Vendor panel**: Dashboard (revenue stats, recent orders), Orders (status progression), Products (CRUD), Store settings
- **Admin panel**: Dashboard, Users list (filterable by role), All orders, Stores, Coupon management (create/view)

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Import `setAuthTokenGetter` from `@workspace/api-client-react` (not the deep `/src/custom-fetch` path — Vite will fail to resolve it).
- Enum status comparisons in route handlers use `as typeof ordersTable.$inferSelect["status"]` cast pattern.
- `productsData` from `useListProducts` returns `{ items, total }` shape — access via `productsData?.items`.
- `pnpm run dev` does NOT exist at workspace root. Use `restart_workflow` to run/restart the dev servers.
- The web artifact runs at port 22333 with `BASE_URL=/` (root path). The API is at port 8080, proxied at `/api`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
