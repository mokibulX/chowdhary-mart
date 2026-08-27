import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { createAndPushNotification } from "./push-service";

const OFFER_SECONDS = 20;
let ready: Promise<void> | null = null;

export async function ensureDeliveryOffersTable() {
  if (!ready) {
    ready = db.execute(sql`
      create table if not exists delivery_order_offers (
        id serial primary key,
        order_id integer not null references orders(id) on delete cascade,
        delivery_partner_id integer not null references delivery_partners(id) on delete cascade,
        status varchar(20) not null default 'offered',
        offered_at timestamp not null default now(),
        expires_at timestamp not null,
        responded_at timestamp,
        unique(order_id, delivery_partner_id)
      )
    `).then(() => db.execute(sql`
      create index if not exists delivery_order_offers_active_idx
      on delivery_order_offers(order_id, status, expires_at)
    `)).then(() => undefined).catch((error) => { ready = null; throw error; });
  }
  await ready;
}

function distanceKm(aLat: number | null, aLng: number | null, bLat: number | null, bLng: number | null) {
  if ([aLat, aLng, bLat, bLng].some((value) => value === null || value === undefined || !Number.isFinite(Number(value)))) return Number.POSITIVE_INFINITY;
  const toRad = (value: number) => value * Math.PI / 180;
  const dLat = toRad(Number(bLat) - Number(aLat));
  const dLng = toRad(Number(bLng) - Number(aLng));
  const lat1 = toRad(Number(aLat));
  const lat2 = toRad(Number(bLat));
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

async function partnerForOffer(orderId: number) {
  const result = await db.execute(sql`
    select dp.id, dp.user_id as "userId", dp.current_lat as "currentLat", dp.current_lng as "currentLng",
           s.lat as "storeLat", s.lng as "storeLng", o.order_number as "orderNumber"
    from delivery_partners dp
    join orders o on o.id = ${orderId}
    join stores s on s.id = o.store_id
    where dp.is_online = true and dp.is_verified = true
      and coalesce(o.zone_id, o.shop_zone_id, s.zone_id) is not null
      and (dp.current_zone_id = coalesce(o.zone_id, o.shop_zone_id, s.zone_id) or exists (
        select 1 from rider_zone_assignments rza
        where rza.rider_id = dp.user_id
          and rza.zone_id = coalesce(o.zone_id, o.shop_zone_id, s.zone_id)
          and rza.status = 'approved'
          and rza.removed_at is null
      ))
      and not exists (
        select 1 from delivery_order_offers old
        where old.order_id = o.id and old.delivery_partner_id = dp.id
      )
      and not exists (
        select 1 from delivery_order_offers active_offer
        where active_offer.delivery_partner_id = dp.id
          and active_offer.status = 'offered'
          and active_offer.expires_at > now()
      )
      and not exists (
        select 1 from order_tracking active_ot
        join orders active_o on active_o.id = active_ot.order_id
        where active_ot.delivery_partner_id = dp.id
          and (active_o.status in ('packed', 'picked_up', 'on_the_way', 'arriving')
            or (active_o.status = 'confirmed' and active_ot.message ilike '%accepted%'))
          and coalesce(active_ot.message, '') not ilike '%rejected%'
          and not exists (
            select 1 from order_tracking newer_ot
            where newer_ot.order_id = active_ot.order_id
              and newer_ot.delivery_partner_id = active_ot.delivery_partner_id
              and newer_ot.updated_at > active_ot.updated_at
          )
      )
    limit 100
  `);
  const rows = ((result as any).rows ?? []) as Array<any>;
  rows.sort((a, b) => distanceKm(a.currentLat, a.currentLng, a.storeLat, a.storeLng) - distanceKm(b.currentLat, b.currentLng, b.storeLat, b.storeLng));
  return rows[0] ?? null;
}

export async function advanceDeliveryOffer(orderId: number) {
  await ensureDeliveryOffersTable();
  const active = await db.execute(sql`
    select * from delivery_order_offers
    where order_id = ${orderId} and status = 'offered' and expires_at > now()
    order by offered_at desc limit 1
  `);
  if ((active as any).rows?.[0]) return (active as any).rows[0];
  const accepted = await db.execute(sql`
    select id from delivery_order_offers
    where order_id = ${orderId} and status = 'accepted'
    limit 1
  `);
  if ((accepted as any).rows?.[0]) return null;
  await db.execute(sql`
    update delivery_order_offers set status = 'expired', responded_at = now()
    where order_id = ${orderId} and status = 'offered' and expires_at <= now()
  `);
  let partner = await partnerForOffer(orderId);
  if (!partner) {
    await db.execute(sql`
      delete from delivery_order_offers
      where order_id = ${orderId} and status in ('rejected', 'expired')
    `);
    partner = await partnerForOffer(orderId);
  }
  if (!partner) return null;
  const inserted = await db.execute(sql`
    insert into delivery_order_offers (order_id, delivery_partner_id, status, offered_at, expires_at)
    values (${orderId}, ${partner.id}, 'offered', now(), now() + (${OFFER_SECONDS} * interval '1 second'))
    on conflict (order_id, delivery_partner_id) do nothing
    returning id, order_id as "orderId", delivery_partner_id as "deliveryPartnerId", offered_at as "offeredAt", expires_at as "expiresAt"
  `);
  const offer = (inserted as any).rows?.[0];
  if (!offer) return advanceDeliveryOffer(orderId);
  try {
    await createAndPushNotification({
      userId: Number(partner.userId),
      type: "delivery_offer",
      title: "New delivery request",
      body: `Order #${partner.orderNumber} is waiting for pickup. Accept within ${OFFER_SECONDS} seconds.`,
      data: { orderId, offerId: offer.id, expiresAt: offer.expiresAt, status: "offered" },
    });
  } catch {
    // Polling still shows the in-app alert when push is not configured.
  }
  return offer;
}

export async function getCurrentDeliveryOffer(orderId: number, partnerId: number) {
  await ensureDeliveryOffersTable();
  return db.execute(sql`
    select id, order_id as "orderId", delivery_partner_id as "deliveryPartnerId", offered_at as "offeredAt", expires_at as "expiresAt"
    from delivery_order_offers
    where order_id = ${orderId} and delivery_partner_id = ${partnerId} and status = 'offered' and expires_at > now()
    limit 1
  `).then((result) => (result as any).rows?.[0] ?? null);
}

export async function acceptDeliveryOffer(orderId: number, partnerId: number) {
  await ensureDeliveryOffersTable();
  const result = await db.execute(sql`
    update delivery_order_offers set status = 'accepted', responded_at = now()
    where order_id = ${orderId} and delivery_partner_id = ${partnerId} and status = 'offered' and expires_at > now()
    returning id
  `);
  return Boolean((result as any).rows?.length);
}

export async function rejectDeliveryOffer(orderId: number, partnerId: number) {
  await ensureDeliveryOffersTable();
  await db.execute(sql`
    update delivery_order_offers set status = 'rejected', responded_at = now()
    where order_id = ${orderId} and delivery_partner_id = ${partnerId} and status = 'offered'
  `);
  return advanceDeliveryOffer(orderId);
}

export async function cancelDeliveryOffers(orderId: number) {
  await ensureDeliveryOffersTable();
  await db.execute(sql`
    update delivery_order_offers
    set status = 'rejected', responded_at = now()
    where order_id = ${orderId} and status in ('offered', 'accepted')
  `);
}
