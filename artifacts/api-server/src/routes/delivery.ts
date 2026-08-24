import { Router } from "express";
import { createHash, randomUUID } from "node:crypto";
import { eq, desc, and, sql } from "drizzle-orm";
import { db, ordersTable, deliveryPartnersTable, liveLocationsTable, orderTrackingTable, storesTable, activeDeliveryLocationsTable, deliveryTrackingHistoryTable } from "@workspace/db";
import { requireApprovedDeliveryPartner, requireAuth, requireRole, type AuthRequest } from "../middleware/auth";
import { riderZoneIds, isInsideZone } from "../lib/zones";
import { createAndPushNotification } from "../lib/push-service";
import { deliveryOtp, expireOrderIfNeeded, lifecycleMeta, pickupOtp } from "../lib/order-lifecycle";
import { testMode } from "../lib/test-mode";
import { ensureFinanceTables, settleCompletedOrder } from "../lib/finance";

const router = Router();

let verificationTableReady: Promise<void> | null = null;
let onlineSessionTableReady: Promise<void> | null = null;

async function ensureOnlineSessionTable() {
  if (!onlineSessionTableReady) {
    onlineSessionTableReady = db.execute(sql`
      alter table delivery_partners add column if not exists online_started_at timestamp
    `).then(() => db.execute(sql`
      create table if not exists delivery_partner_online_sessions (
        id serial primary key,
        delivery_partner_id integer not null references delivery_partners(id) on delete cascade,
        started_at timestamp not null,
        ended_at timestamp,
        duration_seconds integer,
        created_at timestamp not null default now()
      )
    `)).then(() => undefined).catch((error) => { onlineSessionTableReady = null; throw error; });
  }
  await onlineSessionTableReady;
}

function indiaDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  return { year: Number(parts.find((part) => part.type === "year")?.value), month: Number(parts.find((part) => part.type === "month")?.value), day: Number(parts.find((part) => part.type === "day")?.value) };
}

function indiaMidnight(parts: { year: number; month: number; day: number }) {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day) - (5.5 * 60 * 60 * 1000));
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function indiaDateString(date: Date) {
  const { year, month, day } = indiaDateParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function periodWindows(now = new Date()) {
  const parts = indiaDateParts(now);
  const today = indiaMidnight(parts);
  const localDayNumber = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
  const weekStart = addDays(today, -((localDayNumber + 6) % 7));
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1) - (5.5 * 60 * 60 * 1000));
  return { today, tomorrow: addDays(today, 1), weekStart, monthStart, todayKey: indiaDateString(today) };
}

function currentDeliveryStatus(isOnline: boolean, activeDelivery: boolean) {
  return !isOnline ? "offline" : activeDelivery ? "on_delivery" : "online";
}

async function activeDeliveryForPartner(partnerId: number) {
  const rows = await db.execute(sql`
    select 1 from order_tracking ot
    join orders o on o.id = ot.order_id
    where ot.delivery_partner_id = ${partnerId}
      and o.status in ('packed', 'picked_up', 'on_the_way', 'arriving')
      and coalesce(ot.message, '') not ilike '%rejected%'
    limit 1
  `);
  return Boolean((rows as any).rows?.length);
}

async function onlineSecondsBetween(partnerId: number, start: Date, end: Date) {
  const result = await db.execute(sql`
    select coalesce(sum(greatest(0, extract(epoch from (
      least(coalesce(ended_at, now()::timestamp), ${end}) - greatest(started_at, ${start})
    )))), 0)::bigint as seconds
    from delivery_partner_online_sessions
    where delivery_partner_id = ${partnerId}
      and started_at < ${end}
      and coalesce(ended_at, now()::timestamp) > ${start}
  `);
  return Number((result as any).rows?.[0]?.seconds ?? 0);
}

function emptyDailyRows(start: Date, end: Date) {
  const rows: Array<{ date: string; onlineSeconds: number; completedOrders: number; earnings: number }> = [];
  for (let date = start; date < end; date = addDays(date, 1)) rows.push({ date: indiaDateString(date), onlineSeconds: 0, completedOrders: 0, earnings: 0 });
  return rows;
}

function overlapSeconds(start: Date, end: Date | null, dayStart: Date, dayEnd: Date) {
  const from = Math.max(start.getTime(), dayStart.getTime());
  const to = Math.min((end ?? new Date()).getTime(), dayEnd.getTime());
  return Math.max(0, Math.floor((to - from) / 1000));
}
async function ensureVerificationTable() {
  if (!verificationTableReady) {
    verificationTableReady = db.execute(sql`
      create table if not exists delivery_partner_verifications (
        id serial primary key,
        user_id integer not null references users(id) on delete cascade,
        delivery_partner_id integer not null references delivery_partners(id) on delete cascade,
        session_id uuid not null unique,
        nonce_hash text not null,
        provider varchar(30) not null default 'none',
        status varchar(30) not null default 'pending',
        liveness_passed boolean not null default false,
        liveness_confidence real,
        face_match_passed boolean not null default false,
        face_similarity real,
        reference_image_id text,
        failure_reason text,
        attempt_number integer not null default 1,
        created_at timestamp not null default now(),
        verified_at timestamp,
        expires_at timestamp not null,
        consumed_at timestamp
      )
    `).then(() => undefined).catch((error) => { verificationTableReady = null; throw error; });
  }
  await verificationTableReady;
}

function verificationHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

const verificationTtlSeconds = Math.max(60, Number(process.env.LIVENESS_SESSION_TTL_SECONDS ?? 180));
const verificationProvider = String(process.env.LIVENESS_PROVIDER ?? "none").toLowerCase();

router.use(requireAuth, requireRole("delivery_partner", "admin"), requireApprovedDeliveryPartner);

async function getDP(userId: number) {
  const [dp] = await db.select().from(deliveryPartnersTable)
    .where(eq(deliveryPartnersTable.userId, userId)).limit(1);
  return dp;
}

router.post("/verification/start", async (req: AuthRequest, res) => {
  try {
    const dp = await getDP(req.user!.userId);
    if (!dp) { res.status(404).json({ error: "Delivery partner not found" }); return; }
    await ensureVerificationTable();
    const recentFailures = await db.execute(sql`
      select count(*)::int as count from delivery_partner_verifications
      where user_id = ${req.user!.userId} and delivery_partner_id = ${dp.id}
        and status = 'failed' and created_at > now() - interval '15 minutes'
    `);
    if (Number((recentFailures as any).rows?.[0]?.count ?? 0) >= 3) {
      res.status(429).json({ error: "Too many failed verification attempts. Please try again later." });
      return;
    }
    const active = await db.execute(sql`
      select session_id as "sessionId" from delivery_partner_verifications
      where user_id = ${req.user!.userId} and delivery_partner_id = ${dp.id}
        and status = 'pending' and expires_at > now()
      order by created_at desc limit 1
    `);
    const existing = (active as any).rows?.[0];
    if (existing?.sessionId) {
      res.json({ sessionId: existing.sessionId, expiresInSeconds: verificationTtlSeconds, provider: verificationProvider });
      return;
    }
    const sessionId = randomUUID();
    const nonce = randomUUID();
    await db.execute(sql`
      insert into delivery_partner_verifications
        (user_id, delivery_partner_id, session_id, nonce_hash, provider, reference_image_id, expires_at)
      values (${req.user!.userId}, ${dp.id}, ${sessionId}, ${verificationHash(nonce)}, ${verificationProvider}, ${(dp as any).profileSelfie ? `profile:${dp.id}` : null}, now() + (${verificationTtlSeconds} * interval '1 second'))
    `);
    res.status(201).json({ sessionId, expiresInSeconds: verificationTtlSeconds, provider: verificationProvider });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Could not start identity verification" });
  }
});

router.post("/verification/complete", async (req: AuthRequest, res) => {
  try {
    const sessionId = String(req.body?.sessionId ?? "");
    if (!sessionId) { res.status(400).json({ error: "Verification session is required" }); return; }
    await ensureVerificationTable();
    const result = await db.execute(sql`
      select * from delivery_partner_verifications
      where session_id = ${sessionId} and user_id = ${req.user!.userId}
      limit 1
    `);
    const session = (result as any).rows?.[0];
    if (!session || session.status !== "pending" || new Date(session.expires_at).getTime() <= Date.now()) {
      res.status(400).json({ error: "Verification session expired. Please try again." });
      return;
    }
    const provider = String(session.provider ?? "none");
    if (!(testMode.enabled && testMode.allowDemoSelfie)) {
      await db.execute(sql`update delivery_partner_verifications set status = 'failed', failure_reason = 'Liveness provider is not configured' where session_id = ${sessionId}`);
      res.status(503).json({ error: "Live identity verification is not configured yet. Add the server-side liveness provider before going online." });
      return;
    }
    const image = String(req.body?.liveSelfie ?? "");
    if (!image.startsWith("data:image/")) {
      await db.execute(sql`update delivery_partner_verifications set status = 'failed', failure_reason = 'Live camera capture required' where session_id = ${sessionId}`);
      res.status(400).json({ error: "Use the live front camera. Gallery images are not accepted." });
      return;
    }
    await db.execute(sql`
      update delivery_partner_verifications
      set status = 'verified', liveness_passed = true, liveness_confidence = 1,
          face_match_passed = true, face_similarity = 1, verified_at = now()
      where session_id = ${sessionId} and user_id = ${req.user!.userId} and status = 'pending' and expires_at > now()
    `);
    res.json({ verificationId: sessionId, status: "verified", livenessPassed: true, faceMatchPassed: true, provider: "local_test" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Could not complete identity verification" });
  }
});

async function getLatestAssignedTracking(orderId: number) {
  const rows = await db.select().from(orderTrackingTable)
    .where(eq(orderTrackingTable.orderId, orderId))
    .orderBy(desc(orderTrackingTable.updatedAt))
    .limit(25);
  return rows.find(row => row.deliveryPartnerId !== null) ?? null;
}

function isRejectedTracking(message?: string | null) {
  return message?.toLowerCase().includes("rejected") ?? false;
}

async function assertDeliveryAssignment(orderId: number, deliveryPartnerId: number) {
  const latestAssigned = await getLatestAssignedTracking(orderId);
  if (!latestAssigned || isRejectedTracking(latestAssigned.message)) return false;
  return latestAssigned.deliveryPartnerId === deliveryPartnerId;
}

// GET /api/delivery/dashboard-summary
router.get("/dashboard-summary", async (req: AuthRequest, res) => {
  try {
    const dp = await getDP(req.user!.userId);
    if (!dp) { res.status(404).json({ error: "Delivery partner not found" }); return; }
    await ensureOnlineSessionTable();
    await ensureFinanceTables();
    const windows = periodWindows();
    const onlineState = await db.execute(sql`select online_started_at as "onlineStartedAt" from delivery_partners where id = ${dp.id}`);
    const onlineStartedAt = (onlineState as any).rows?.[0]?.onlineStartedAt ?? null;
    const activeDelivery = await activeDeliveryForPartner(dp.id);
    const onlineSecondsToday = await onlineSecondsBetween(dp.id, windows.today, windows.tomorrow);
    const onlineSecondsWeek = await onlineSecondsBetween(dp.id, windows.weekStart, windows.tomorrow);
    const onlineSecondsMonth = await onlineSecondsBetween(dp.id, windows.monthStart, windows.tomorrow);
    const earnings = await db.execute(sql`
      select
        coalesce(sum(case when ret.created_at >= ${windows.today} and ret.created_at < ${windows.tomorrow} then ret.final_earning else 0 end), 0) as "earningsToday",
        coalesce(sum(case when ret.created_at >= ${windows.weekStart} and ret.created_at < ${windows.tomorrow} then ret.final_earning else 0 end), 0) as "earningsWeek",
        coalesce(sum(case when ret.created_at >= ${windows.monthStart} and ret.created_at < ${windows.tomorrow} then ret.final_earning else 0 end), 0) as "earningsMonth",
        coalesce(sum(ret.final_earning), 0) as "totalEarnings",
        count(*) filter (where o.delivered_at >= ${windows.today} and o.delivered_at < ${windows.tomorrow})::int as "ordersToday",
        count(*) filter (where o.delivered_at >= ${windows.weekStart} and o.delivered_at < ${windows.tomorrow})::int as "ordersWeek",
        count(*) filter (where o.delivered_at >= ${windows.monthStart} and o.delivered_at < ${windows.tomorrow})::int as "ordersMonth",
        count(*)::int as "totalCompletedOrders"
      from rider_earning_transactions ret
      join orders o on o.id = ret.order_id
      where ret.rider_user_id = ${req.user!.userId} and o.status = 'delivered'
    `);
    const row = (earnings as any).rows?.[0] ?? {};
    const chartStart = addDays(windows.tomorrow, -30);
    const chartRows = emptyDailyRows(chartStart, windows.tomorrow);
    const rowByDate = new Map(chartRows.map((item) => [item.date, item]));
    const earningsRows = await db.execute(sql`
      select o.delivered_at as "deliveredAt", ret.final_earning as earnings
      from rider_earning_transactions ret
      join orders o on o.id = ret.order_id
      where ret.rider_user_id = ${req.user!.userId} and o.status = 'delivered' and o.delivered_at >= ${chartStart} and o.delivered_at < ${windows.tomorrow}
    `);
    for (const item of ((earningsRows as any).rows ?? [])) {
      const date = indiaDateString(new Date(item.deliveredAt));
      const target = rowByDate.get(date);
      if (target) { target.earnings += Number(item.earnings ?? 0); target.completedOrders += 1; }
    }
    const sessions = await db.execute(sql`
      select started_at as "startedAt", ended_at as "endedAt"
      from delivery_partner_online_sessions
      where delivery_partner_id = ${dp.id} and started_at < ${windows.tomorrow} and coalesce(ended_at, now()::timestamp) > ${chartStart}
    `);
    for (const session of ((sessions as any).rows ?? [])) {
      for (const day of chartRows) {
        const dayStart = indiaMidnight({ year: Number(day.date.slice(0, 4)), month: Number(day.date.slice(5, 7)), day: Number(day.date.slice(8, 10)) });
        const target = rowByDate.get(day.date);
        if (target) target.onlineSeconds += overlapSeconds(new Date(session.startedAt), session.endedAt ? new Date(session.endedAt) : null, dayStart, addDays(dayStart, 1));
      }
    }
    res.json({
      currentStatus: currentDeliveryStatus(dp.isOnline, activeDelivery),
      currentOnlineStartedAt: onlineStartedAt,
      onlineSecondsToday,
      onlineSecondsWeek,
      onlineSecondsMonth,
      ordersToday: Number(row.ordersToday ?? 0),
      ordersWeek: Number(row.ordersWeek ?? 0),
      ordersMonth: Number(row.ordersMonth ?? 0),
      totalCompletedOrders: Number(row.totalCompletedOrders ?? 0),
      earningsToday: Number(row.earningsToday ?? 0),
      earningsWeek: Number(row.earningsWeek ?? 0),
      earningsMonth: Number(row.earningsMonth ?? 0),
      totalEarnings: Number(row.totalEarnings ?? 0),
      daily: chartRows.map((item) => ({ ...item, onlineHours: Number((item.onlineSeconds / 3600).toFixed(2)) })),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Could not load delivery dashboard summary" });
  }
});

// GET /api/delivery/orders
router.get("/orders", async (req: AuthRequest, res) => {
  try {
    const dp = await getDP(req.user!.userId);
    if (!dp) { res.status(200).json([]); return; }

    const trackings = await db.select().from(orderTrackingTable)
      .where(eq(orderTrackingTable.deliveryPartnerId, dp.id));

    const orderIds = [...new Set(trackings.map(t => t.orderId))];
    if (orderIds.length === 0) { res.status(200).json([]); return; }

    const stores = await db.select().from(storesTable);
    const storeMap = new Map(stores.map(s => [s.id, s]));

    const orders = await Promise.all(orderIds.map(async id => {
      const [rawOrder] = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
      const order = rawOrder ? await expireOrderIfNeeded(rawOrder) : null;
      const store = order ? storeMap.get(order.storeId) : null;
      const lifecycle = order ? await lifecycleMeta(order) : null;
      return order ? {
        ...order,
        store,
        liveTracking: {
          orderId: order.id,
          status: order.status,
          estimatedMins: order.estimatedDeliveryMins ?? 40,
          storeLocation: store ? { lat: store.lat, lng: store.lng, label: store.name, address: store.address } : null,
          customerLocation: order.pickupLatitude && order.pickupLongitude ? {
            lat: Number(order.pickupLatitude),
            lng: Number(order.pickupLongitude),
            label: "Customer pickup location",
            address: order.pickupAddress ?? "Confirmed pickup point",
          } : null,
          pickupOtp: lifecycle?.pickupOtp,
          deliveryOtp: lifecycle?.deliveryOtp,
          lifecycle,
        },
      } : null;
    }));

    res.json(orders.filter(Boolean).sort((a: any, b: any) =>
      new Date(b!.createdAt).getTime() - new Date(a!.createdAt).getTime()
    ));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/delivery/available-orders
router.get("/available-orders", async (req: AuthRequest, res) => {
  try {
    const dp = await getDP(req.user!.userId);
    if (!dp || !dp.isVerified || !dp.isOnline) { res.status(200).json([]); return; }
    const zones = await riderZoneIds(req.user!.userId);
    if (!zones.length) { res.status(200).json([]); return; }
    const orders = await db.select().from(ordersTable)
      .where(eq(ordersTable.status, "confirmed"))
      .orderBy(desc(ordersTable.createdAt))
      .limit(30);
    const stores = await db.select().from(storesTable);
    const storeMap = new Map(stores.map(s => [s.id, s]));
    const activeOrders = await Promise.all(orders.map(expireOrderIfNeeded));
    res.json(activeOrders
      .filter((order) => order.status === "confirmed")
      .filter((order) => Boolean(order.zoneId) && zones.includes(order.zoneId!))
      .map(order => {
        const store = storeMap.get(order.storeId);
        return {
          ...order,
          store,
          liveTracking: {
            orderId: order.id,
            status: order.status,
            estimatedMins: order.estimatedDeliveryMins ?? 40,
            storeLocation: store ? { lat: store.lat, lng: store.lng, label: store.name, address: store.address } : null,
            customerLocation: order.pickupLatitude && order.pickupLongitude ? {
              lat: Number(order.pickupLatitude),
              lng: Number(order.pickupLongitude),
              label: "Customer pickup location",
              address: order.pickupAddress ?? "Confirmed pickup point",
            } : null,
            lifecycle: { sellerDecisionDeadline: null, preparationDeadline: null, pickupDeadline: null },
          },
        };
      }));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/delivery/orders/:orderId/accept
router.post("/orders/:orderId/accept", async (req: AuthRequest, res) => {
  try {
    const dp = await getDP(req.user!.userId);
    if (!dp) { res.status(404).json({ error: "Delivery partner not found" }); return; }
    const orderId = Number(req.params.orderId);
    const [rawOrder] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
    const order = rawOrder ? await expireOrderIfNeeded(rawOrder) : null;
    if (!order) { res.status(404).json({ error: "Order not found" }); return; }
    if (order.status !== "confirmed") { res.status(409).json({ error: "This delivery request is no longer available." }); return; }
    if (!dp.isVerified || !dp.isOnline) { res.status(403).json({ error: "Delivery partner must be approved and online." }); return; }
    const zones = await riderZoneIds(req.user!.userId);
    if (!order.zoneId || !zones.includes(order.zoneId)) { res.status(403).json({ error: "This order belongs to another service zone." }); return; }
    const [store] = await db.select().from(storesTable).where(eq(storesTable.id, order.storeId)).limit(1);
    if (!store?.zoneId || !zones.includes(store.zoneId)) { res.status(403).json({ error: "Pickup store is outside your service zone." }); return; }

    const latestAssigned = await getLatestAssignedTracking(orderId);
    if (latestAssigned && !isRejectedTracking(latestAssigned.message) && latestAssigned.deliveryPartnerId !== dp.id) {
      res.status(409).json({ error: "This order has already been accepted by another delivery partner." });
      return;
    }

    await db.insert(orderTrackingTable).values({
      orderId,
      deliveryPartnerId: dp.id,
      status: order.status,
      message: "Delivery partner accepted the order",
      lat: dp.currentLat,
      lng: dp.currentLng,
    });

    try {
      await createAndPushNotification({
        userId: order.userId,
        type: "rider_assigned",
        title: "Delivery partner assigned",
        body: `A delivery partner accepted order #${order.orderNumber} and is heading to the shop.`,
        data: { orderId, status: order.status },
      });
    } catch (notificationError) {
      req.log.warn({ err: notificationError, orderId }, "Rider assignment notification failed");
    }

    res.json({ ...order, riderZoneId: order.zoneId ?? dp.currentZoneId, assignedDeliveryPartnerId: dp.id });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/delivery/orders/:orderId/reject
router.post("/orders/:orderId/reject", async (req: AuthRequest, res) => {
  try {
    const dp = await getDP(req.user!.userId);
    const orderId = Number(req.params.orderId);
    if (!dp) { res.status(404).json({ error: "Delivery partner not found" }); return; }
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
    if (!order) { res.status(404).json({ error: "Order not found" }); return; }
    const zones = await riderZoneIds(req.user!.userId);
    if (!order.zoneId || !zones.includes(order.zoneId)) {
      res.status(403).json({ error: "This order belongs to another service zone." });
      return;
    }
    await db.insert(orderTrackingTable).values({
      orderId,
      deliveryPartnerId: dp.id,
      status: "confirmed",
      message: "Delivery partner rejected the order",
    });
    res.json({ message: "Order rejected" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/delivery/orders/:orderId/status
router.patch("/orders/:orderId/status", async (req: AuthRequest, res) => {
  try {
    const dp = await getDP(req.user!.userId);
    if (!dp) { res.status(404).json({ error: "Delivery partner not found" }); return; }
    const orderId = Number(req.params.orderId);
    const { status, pickupOtp: enteredPickupOtp, otp } = req.body as { status: "picked_up" | "on_the_way" | "delivered"; pickupOtp?: string; otp?: string };
    const [targetOrder] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
    const zones = await riderZoneIds(req.user!.userId);
    if (!targetOrder || !targetOrder.zoneId || !zones.includes(targetOrder.zoneId)) { res.status(403).json({ error: "This order belongs to another service zone." }); return; }
    if (!(await assertDeliveryAssignment(orderId, dp.id))) {
      res.status(403).json({ error: "This order is not assigned to this delivery partner." });
      return;
    }
    const validTransition = (status === "picked_up" && targetOrder.status === "packed")
      || (status === "on_the_way" && targetOrder.status === "picked_up")
      || (status === "delivered" && targetOrder.status === "on_the_way");
    if (!validTransition) { res.status(400).json({ error: "Invalid delivery status transition." }); return; }
    if (status === "picked_up" && String(enteredPickupOtp ?? "") !== pickupOtp(orderId)) {
      res.status(400).json({ error: "Invalid pickup OTP." }); return;
    }
    if (status === "delivered" && String(otp ?? "") !== deliveryOtp(orderId)) {
      res.status(400).json({ error: "Invalid customer delivery OTP." }); return;
    }

    const update: Partial<typeof ordersTable.$inferInsert> = { status, riderZoneId: targetOrder.zoneId ?? dp.currentZoneId ?? null, updatedAt: new Date() };
    if (status === "delivered") update.deliveredAt = new Date();

    const [order] = await db.update(ordersTable)
      .set(update)
      .where(eq(ordersTable.id, orderId))
      .returning();

    await db.insert(orderTrackingTable).values({
      orderId,
      deliveryPartnerId: dp.id,
      status,
      message: `Delivery partner marked ${status.replace(/_/g, " ")}`,
      lat: dp.currentLat,
      lng: dp.currentLng,
    });

    if (status === "delivered") {
      await settleCompletedOrder(orderId);
    }

    try {
      await createAndPushNotification({
        userId: targetOrder.userId,
        type: `order_${status}`,
        title: status === "picked_up" ? "Order picked up" : status === "on_the_way" ? "Order is on the way" : "Order delivered",
        body: `Order #${targetOrder.orderNumber} is now ${status.replace(/_/g, " ")}.`,
        data: { orderId, status },
      });
    } catch (notificationError) {
      req.log.warn({ err: notificationError, orderId }, "Delivery status notification failed");
    }

    res.json(order);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/delivery/location
router.patch("/location", async (req: AuthRequest, res) => {
  try {
    const { lat, lng, speed, heading, accuracy, altitude, timestamp, orderId, zoneId } = req.body as {
      lat: number;
      lng: number;
      speed?: number;
      heading?: number;
      accuracy?: number;
      altitude?: number;
      timestamp?: string;
      orderId?: number;
      zoneId?: number;
    };
    const dp = await getDP(req.user!.userId);
    if (!dp) { res.status(404).json({ error: "Delivery partner not found" }); return; }
    if (orderId && !(await assertDeliveryAssignment(Number(orderId), dp.id))) {
      res.status(403).json({ error: "Cannot update location for an order assigned to another delivery partner." });
      return;
    }

    // Update current location on partner
    await db.update(deliveryPartnersTable)
      .set({ currentLat: lat, currentLng: lng, currentZoneId: zoneId ?? dp.currentZoneId ?? null })
      .where(eq(deliveryPartnersTable.id, dp.id));

    // Upsert live location
    const [existing] = await db.select().from(liveLocationsTable)
      .where(eq(liveLocationsTable.deliveryPartnerId, dp.id)).limit(1);

    if (existing) {
      await db.update(liveLocationsTable)
        .set({ lat, lng, speed: speed ?? 0, heading: heading ?? 0, updatedAt: new Date() })
        .where(eq(liveLocationsTable.deliveryPartnerId, dp.id));
    } else {
      await db.insert(liveLocationsTable).values({
        deliveryPartnerId: dp.id,
        lat, lng, speed: speed ?? 0, heading: heading ?? 0,
      });
    }

    const activeRows = await db.select().from(activeDeliveryLocationsTable)
      .where(eq(activeDeliveryLocationsTable.deliveryPartnerId, dp.id)).limit(1);
    if (activeRows[0]) {
      await db.update(activeDeliveryLocationsTable)
        .set({
          orderId: orderId ?? activeRows[0].orderId,
          latitude: lat,
          longitude: lng,
          speed: speed ?? 0,
          heading: heading ?? 0,
          accuracy: accuracy ?? null,
          altitude: altitude ?? null,
          zoneId: zoneId ?? activeRows[0].zoneId,
          status: "online",
          updatedAt: new Date(),
        })
        .where(eq(activeDeliveryLocationsTable.deliveryPartnerId, dp.id));
    } else {
      await db.insert(activeDeliveryLocationsTable).values({
        orderId: orderId ?? null,
        deliveryPartnerId: dp.id,
        latitude: lat,
        longitude: lng,
        speed: speed ?? 0,
        heading: heading ?? 0,
        accuracy: accuracy ?? null,
        altitude: altitude ?? null,
        zoneId: zoneId ?? null,
        status: "online",
      });
    }

    await db.insert(deliveryTrackingHistoryTable).values({
      orderId: orderId ?? null,
      deliveryPartnerId: dp.id,
      latitude: lat,
      longitude: lng,
      speed: speed ?? 0,
      heading: heading ?? 0,
      accuracy: accuracy ?? null,
      altitude: altitude ?? null,
      source: "gps",
      recordedAt: timestamp ? new Date(timestamp) : new Date(),
    });

    const payload = {
      deliveryPartnerId: dp.id,
      orderId: orderId ?? null,
      lat,
      lng,
      speed: speed ?? 0,
      heading: heading ?? 0,
      accuracy: accuracy ?? null,
      altitude: altitude ?? null,
      timestamp: timestamp ?? new Date().toISOString(),
    };

    const io = req.app.get("io");
    io?.to(`rider:location:${dp.id}`).emit("rider:location", payload);
    if (orderId) io?.to(`delivery:tracking:${orderId}`).emit("delivery:tracking", payload);
    if (zoneId) io?.to(`zone:riders:${zoneId}`).emit("zone:riders", payload);

    res.json({ message: "Location updated", location: payload });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/delivery/toggle-online
router.patch("/toggle-online", async (req: AuthRequest, res) => {
  try {
    const dp = await getDP(req.user!.userId);
    if (!dp) { res.status(404).json({ error: "Delivery partner not found" }); return; }
    if (!dp.isVerified) { res.status(403).json({ error: "Admin approval required before going online." }); return; }
    await ensureOnlineSessionTable();
    const nextOnline = typeof req.body?.online === "boolean" ? req.body.online : !dp.isOnline;
    const location = req.body?.location;
    if (!nextOnline && await activeDeliveryForPartner(dp.id)) {
      res.status(409).json({ error: "Finish or cancel the active delivery before going offline." });
      return;
    }
    if (nextOnline) {
      const updated = await db.execute(sql`
        update delivery_partners
        set is_online = true, online_started_at = now(),
            current_lat = coalesce(${location?.lat !== undefined ? Number(location.lat) : null}, current_lat),
            current_lng = coalesce(${location?.lng !== undefined ? Number(location.lng) : null}, current_lng)
        where id = ${dp.id} and is_online = false
        returning id
      `);
      if ((updated as any).rows?.length) {
        await db.execute(sql`insert into delivery_partner_online_sessions (delivery_partner_id, started_at) values (${dp.id}, now())`);
      }
    } else {
      await db.execute(sql`
        update delivery_partner_online_sessions
        set ended_at = now(), duration_seconds = greatest(0, extract(epoch from (now()::timestamp - started_at)))::int
        where delivery_partner_id = ${dp.id} and ended_at is null
      `);
      await db.execute(sql`update delivery_partners set is_online = false, online_started_at = null where id = ${dp.id} and is_online = true`);
      await db.delete(activeDeliveryLocationsTable).where(eq(activeDeliveryLocationsTable.deliveryPartnerId, dp.id));
    }
    const [updated] = await db.select().from(deliveryPartnersTable).where(eq(deliveryPartnersTable.id, dp.id)).limit(1);
    const activeDelivery = await activeDeliveryForPartner(dp.id);
    res.json({ message: `Now ${nextOnline ? "online" : "offline"}`, isOnline: updated?.isOnline ?? nextOnline, currentStatus: currentDeliveryStatus(updated?.isOnline ?? nextOnline, activeDelivery), partner: updated });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
