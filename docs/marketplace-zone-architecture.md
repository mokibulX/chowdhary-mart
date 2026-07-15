# ChowdharyMart Marketplace Zone Architecture

## Current Implementation

The current app runs on the local mock API layer in `lib/api-client-react`. Phase 1 adds a real service-zone model to that layer so the customer experience, seller visibility, cart validation, admin controls, and product queries all follow the same 5 km quick-commerce rule.

Implemented mock tables/collections:

- `serviceZones`
- `stores.zoneId`
- `stores.serviceRadiusMeters`
- `products.zoneId`
- `products.masterProductId`
- `products.listingStatus`
- `orders.zoneId`
- `orders.serviceZoneSnapshot`
- `inventoryTransactions`
- `refunds`
- `invoices`
- `printLogs`
- `orderAuditLog`

Implemented endpoints:

- `GET /api/service-zones`
- `GET /api/service-zones/resolve?lat=&lng=`
- `GET /api/products?lat=&lng=&radiusKm=&zoneId=`
- `GET /api/stores?lat=&lng=&zoneId=`
- `GET /api/admin/service-zones`
- `POST /api/admin/service-zones`
- `PATCH /api/admin/service-zones/:id`
- `DELETE /api/admin/service-zones/:id`

Admin UI:

- `/admin/zones`

## Production Database Shape

Use one central PostgreSQL database with PostGIS, not one database per 5 km area.

Core tables:

- `service_zones`
- `cities`
- `admin_roles`
- `admin_zone_assignments`
- `shops`
- `shop_locations`
- `products`
- `product_images`
- `shop_products`
- `shop_inventory`
- `inventory_transactions`
- `parent_orders`
- `seller_orders`
- `order_items`
- `delivery_requests`
- `active_deliveries`
- `rider_locations`
- `payments`
- `refunds`
- `invoices`
- `print_logs`
- `audit_logs`

Important indexes:

- `service_zones USING GIST(boundary_geometry)`
- `shops USING GIST(location)`
- `shops(zone_id, status)`
- `shop_products(zone_id, listing_status, stock)`
- `shop_products(shop_id, product_id)`
- `shop_products(zone_id, selling_price)`
- `orders(zone_id, status, created_at)`
- `delivery_requests(zone_id, status, created_at)`
- `rider_locations USING GIST(location)`

## Zone Query Rules

Customer location should resolve using:

- `ST_Contains(boundary_geometry, point)`
- fallback `ST_DWithin(centre_geography, customer_geography, radius_meters)`
- nearest active zone by `ST_Distance`

All customer product queries must include:

- active zone
- active shop
- approved listing
- in-stock listing
- distance within shop service radius

## Environment Variables

Required for production:

```env
DATABASE_URL=
REDIS_URL=
JWT_SECRET=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_CDN_URL=
MAPS_API_KEY=
ROUTES_API_KEY=
GEOCODING_API_KEY=
FCM_PROJECT_ID=
FCM_CLIENT_EMAIL=
FCM_PRIVATE_KEY=
WEBSOCKET_URL=
ENABLE_DEMO_ACCOUNTS=false
```

## Scaling Notes

- Product APIs must use cursor or offset pagination with max page size 40.
- Images must be stored in R2/S3/Supabase Storage, not database binary fields.
- Realtime rider location should use Redis/WebSocket for latest location and periodic PostgreSQL history writes.
- Search should start with PostgreSQL full-text/trigram indexes and later support Meilisearch, Typesense, or OpenSearch.
- Background jobs should handle image moderation, thumbnail generation, notification fanout, invoice emails, and refund sync.

## Remaining Production Work

- Replace local mock storage with real PostgreSQL/PostGIS migrations.
- Add Redis-backed realtime location channels.
- Add Firebase Cloud Messaging and Web Push service worker.
- Add signed storage upload URLs and image moderation.
- Add real payment gateway refund integration.
- Add role/zone row-level access policies.
- Add load tests for 10 lakh listing simulation.
