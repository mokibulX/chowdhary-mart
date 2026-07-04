export type DeliveryLocation = {
  pincode: string;
  city: string;
  state: string;
  area: string;
  lat: number;
  lng: number;
};

export const DELIVERY_LOCATION_STORAGE_KEY = "ekart_delivery_location";

export const PINCODE_LOCATIONS: DeliveryLocation[] = [
  { pincode: "700001", city: "Kolkata", state: "West Bengal", area: "B. B. D. Bagh", lat: 22.5726, lng: 88.3639 },
  { pincode: "700156", city: "Kolkata", state: "West Bengal", area: "New Town", lat: 22.6076, lng: 88.4695 },
  { pincode: "110001", city: "New Delhi", state: "Delhi", area: "Connaught Place", lat: 28.6139, lng: 77.209 },
  { pincode: "400001", city: "Mumbai", state: "Maharashtra", area: "Fort", lat: 18.9388, lng: 72.8354 },
  { pincode: "560001", city: "Bengaluru", state: "Karnataka", area: "MG Road", lat: 12.9716, lng: 77.5946 },
  { pincode: "600001", city: "Chennai", state: "Tamil Nadu", area: "George Town", lat: 13.0827, lng: 80.2707 },
  { pincode: "500001", city: "Hyderabad", state: "Telangana", area: "Abids", lat: 17.385, lng: 78.4867 },
  { pincode: "411001", city: "Pune", state: "Maharashtra", area: "Camp", lat: 18.5204, lng: 73.8567 },
];

export function lookupPincode(value: string) {
  const pincode = value.replace(/\D/g, "").slice(0, 6);
  return PINCODE_LOCATIONS.find((item) => item.pincode === pincode) ?? null;
}

export function getSavedDeliveryLocation(): DeliveryLocation {
  if (typeof window === "undefined") return PINCODE_LOCATIONS[1];
  const raw = window.localStorage.getItem(DELIVERY_LOCATION_STORAGE_KEY);
  if (!raw) return PINCODE_LOCATIONS[1];
  try {
    const parsed = JSON.parse(raw) as DeliveryLocation;
    return parsed?.pincode ? parsed : PINCODE_LOCATIONS[1];
  } catch {
    return PINCODE_LOCATIONS[1];
  }
}

export function saveDeliveryLocation(location: DeliveryLocation) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DELIVERY_LOCATION_STORAGE_KEY, JSON.stringify(location));
  window.dispatchEvent(new CustomEvent("delivery-location-change", { detail: location }));
}
