import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { ensureFinanceTables, getFinanceSettings } from "./finance";
import { DEFAULT_LOCATION } from "./default-location";

export type PricingSettings = {
  commissionPercentage: string | number;
  deliveryRatePerKm: string | number;
  deliveryMinCharge?: string | number;
  maxDeliveryDistanceKm?: string | number;
  freeDeliveryThreshold?: string | number;
  deliveryChargeEnabled?: boolean;
  additionalItemDeliveryPercentage?: string | number;
  firstItemDeliveryPercentage?: string | number;
  secondItemDeliveryPercentage?: string | number;
  thirdItemDeliveryPercentage?: string | number;
  freeDeliveryFromItem?: string | number;
};

export type OrderPricing = {
  sellerBaseAmount: number;
  productSubtotal: number;
  commissionPercentage: number;
  commissionAmount: number;
  calculatedDistanceKm: number | null;
  deliveryRatePerKm: number;
  deliveryCharge: number;
  fullDeliveryCharge: number;
  firstItemDeliveryCharge: number;
  additionalItemDeliveryPercentage: number;
  additionalItemDeliveryCharge: number;
  eligibleItemCount: number;
  secondItemDeliveryCharge: number;
  thirdItemDeliveryCharge: number;
  freeDeliveryItemCount: number;
  discountAmount: number;
  finalCustomerAmount: number;
  currency: "INR";
};

let pricingSchemaReady: Promise<void> | null = null;

function amount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100) / 100) : 0;
}

function roundMoney(value: number) {
  return Math.round(Math.max(0, value) * 100) / 100;
}

function toPaise(value: number) {
  return Math.max(0, Math.round(value * 100));
}

function fromPaise(value: number) {
  return Math.max(0, Math.round(value)) / 100;
}

export function validCoordinate(value: unknown, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

export function distanceKm(aLat: unknown, aLng: unknown, bLat: unknown, bLng: unknown) {
  const lat1 = validCoordinate(aLat, -90, 90);
  const lng1 = validCoordinate(aLng, -180, 180);
  const lat2 = validCoordinate(bLat, -90, 90);
  const lng2 = validCoordinate(bLng, -180, 180);
  if (lat1 === null || lng1 === null || lat2 === null || lng2 === null) return null;
  const toRad = (value: number) => value * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const firstLat = toRad(lat1);
  const secondLat = toRad(lat2);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(firstLat) * Math.cos(secondLat) * Math.sin(dLng / 2) ** 2;
  return roundMoney(2 * 6371 * Math.asin(Math.sqrt(Math.min(1, h))));
}

export async function ensurePricingSchema() {
  if (!pricingSchemaReady) pricingSchemaReady = (async () => {
    await ensureFinanceTables();
    await db.execute(sql.raw(`
    alter table platform_settings add column if not exists delivery_min_charge numeric(10,2) not null default 0;
    alter table platform_settings add column if not exists max_delivery_distance_km numeric(10,2) not null default 5;
    alter table platform_settings add column if not exists free_delivery_threshold numeric(12,2) not null default 0;
    alter table platform_settings add column if not exists delivery_charge_enabled boolean not null default true;
    alter table platform_settings add column if not exists additional_item_delivery_percentage numeric(5,2) not null default 50;
    alter table platform_settings add column if not exists first_item_delivery_percentage numeric(5,2) not null default 100;
    alter table platform_settings add column if not exists second_item_delivery_percentage numeric(5,2) not null default 50;
    alter table platform_settings add column if not exists third_item_delivery_percentage numeric(5,2) not null default 50;
    alter table platform_settings add column if not exists free_delivery_from_item integer not null default 4;
    alter table orders add column if not exists platform_fee numeric(10,2) not null default 0;
    alter table orders add column if not exists commission_percentage numeric(5,2) not null default 0;
    alter table orders add column if not exists commission_amount numeric(10,2) not null default 0;
    alter table orders add column if not exists calculated_distance_km numeric(8,2);
    alter table orders add column if not exists delivery_rate_per_km numeric(10,2) not null default 0;
    alter table orders add column if not exists delivery_full_charge numeric(10,2) not null default 0;
    alter table orders add column if not exists delivery_first_item_charge numeric(10,2) not null default 0;
    alter table orders add column if not exists delivery_additional_item_percentage numeric(5,2) not null default 50;
    alter table orders add column if not exists delivery_additional_item_charge numeric(10,2) not null default 0;
    alter table orders add column if not exists delivery_eligible_item_count integer not null default 1;
    alter table orders add column if not exists delivery_second_item_charge numeric(10,2) not null default 0;
    alter table orders add column if not exists delivery_third_item_charge numeric(10,2) not null default 0;
    alter table orders add column if not exists delivery_free_item_count integer not null default 0;
    alter table orders add column if not exists final_customer_amount numeric(10,2) not null default 0;
    `));
  })().catch((error) => {
    pricingSchemaReady = null;
    throw error;
  });
  await pricingSchemaReady;
}

export async function getPricingSettings(): Promise<PricingSettings> {
  await ensureFinanceTables();
  const settings = await getFinanceSettings();
  return settings as PricingSettings;
}

export function calculateOrderPricing(input: {
  subtotal: number;
  store: { lat?: unknown; lng?: unknown; radiusKm?: unknown };
  customerLat?: unknown;
  customerLng?: unknown;
  settings: PricingSettings;
  discountAmount?: number;
  eligibleItemCount?: number;
}) {
  const productSubtotal = roundMoney(input.subtotal);
  const commissionPercentage = amount(input.settings.commissionPercentage);
  const commissionAmount = roundMoney(productSubtotal * commissionPercentage / 100);
  const distance = distanceKm(input.store.lat, input.store.lng, input.customerLat ?? DEFAULT_LOCATION.lat, input.customerLng ?? DEFAULT_LOCATION.lng);
  const configuredMax = amount(input.settings.maxDeliveryDistanceKm);
  const storeRadius = amount(input.store.radiusKm) || configuredMax || 5;
  const maxDistance = configuredMax > 0 ? Math.min(configuredMax, storeRadius || configuredMax) : storeRadius;
  if (distance === null) throw new Error("Valid seller and customer locations are required to calculate delivery.");
  if (maxDistance > 0 && distance > maxDistance) throw new Error(`Delivery is available only within ${maxDistance.toFixed(0)} km of this seller.`);
  const rate = amount(input.settings.deliveryRatePerKm);
  const minCharge = amount(input.settings.deliveryMinCharge);
  const freeThreshold = amount(input.settings.freeDeliveryThreshold);
  const deliveryEnabled = input.settings.deliveryChargeEnabled !== false;
  const freeDelivery = freeThreshold > 0 && productSubtotal >= freeThreshold;
  const calculatedChargePaise = deliveryEnabled && !freeDelivery ? toPaise(distance * rate) : 0;
  const minChargePaise = toPaise(minCharge);
  const fullDeliveryChargePaise = calculatedChargePaise > 0 ? Math.max(minChargePaise, calculatedChargePaise) : 0;
  const eligibleItemCount = Math.max(1, Math.floor(Number(input.eligibleItemCount ?? 1)) || 1);
  const firstItemDeliveryPercentage = Math.min(100, Math.max(0, amount(input.settings.firstItemDeliveryPercentage ?? 100)));
  const secondItemDeliveryPercentage = Math.min(100, Math.max(0, amount(input.settings.secondItemDeliveryPercentage ?? input.settings.additionalItemDeliveryPercentage ?? 50)));
  const thirdItemDeliveryPercentage = Math.min(100, Math.max(0, amount(input.settings.thirdItemDeliveryPercentage ?? input.settings.additionalItemDeliveryPercentage ?? 50)));
  const additionalItemDeliveryPercentage = secondItemDeliveryPercentage;
  const freeDeliveryFromItem = Math.max(4, Math.floor(Number(input.settings.freeDeliveryFromItem ?? 4)) || 4);
  const additionalItemCount = Math.max(0, eligibleItemCount - 1);
  const firstItemDeliveryChargePaise = Math.round(fullDeliveryChargePaise * firstItemDeliveryPercentage / 100);
  const secondItemDeliveryChargePaise = eligibleItemCount >= 2 ? Math.round(fullDeliveryChargePaise * secondItemDeliveryPercentage / 100) : 0;
  const thirdItemDeliveryChargePaise = eligibleItemCount >= 3 ? Math.round(fullDeliveryChargePaise * thirdItemDeliveryPercentage / 100) : 0;
  const freeDeliveryItemCount = Math.max(0, eligibleItemCount - freeDeliveryFromItem + 1);
  let additionalItemDeliveryChargePaise = secondItemDeliveryChargePaise + thirdItemDeliveryChargePaise;
  if (freeDeliveryFromItem > 4) {
    additionalItemDeliveryChargePaise += Math.round(fullDeliveryChargePaise * thirdItemDeliveryPercentage / 100) * Math.max(0, Math.min(eligibleItemCount, freeDeliveryFromItem - 1) - 3);
  }
  const deliveryChargePaise = firstItemDeliveryChargePaise + additionalItemDeliveryChargePaise;
  const fullDeliveryCharge = fromPaise(fullDeliveryChargePaise);
  const firstItemDeliveryCharge = fromPaise(firstItemDeliveryChargePaise);
  const additionalItemDeliveryCharge = fromPaise(additionalItemDeliveryChargePaise);
  const deliveryCharge = fromPaise(deliveryChargePaise);
  const discountAmount = Math.min(productSubtotal + commissionAmount + deliveryCharge, amount(input.discountAmount));
  const finalCustomerAmount = roundMoney(productSubtotal + commissionAmount + deliveryCharge - discountAmount);
  return {
    sellerBaseAmount: productSubtotal,
    productSubtotal,
    commissionPercentage,
    commissionAmount,
    calculatedDistanceKm: distance,
    deliveryRatePerKm: rate,
    deliveryCharge,
    fullDeliveryCharge,
    firstItemDeliveryCharge,
    additionalItemDeliveryPercentage,
    additionalItemDeliveryCharge,
    eligibleItemCount,
    secondItemDeliveryCharge: fromPaise(secondItemDeliveryChargePaise),
    thirdItemDeliveryCharge: fromPaise(thirdItemDeliveryChargePaise),
    freeDeliveryItemCount,
    discountAmount,
    finalCustomerAmount,
    currency: "INR" as const,
  } satisfies OrderPricing;
}
