import { customFetch } from "@workspace/api-client-react";

export type LiveLocation = {
  lat: number;
  lng: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  capturedAt: string;
};

export type ResolvedIndianLocation = LiveLocation & {
  address: string;
  area: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
};

function addressComponent(components: any[] | undefined, type: string) {
  return String(components?.find((item) => item.types?.includes(type))?.long_name ?? "");
}

export async function resolveIndianLocation(location: LiveLocation): Promise<ResolvedIndianLocation> {
  const data = await customFetch<any>(`/api/maps/geocode?latlng=${location.lat},${location.lng}`, { responseType: "json" });
  const result = data?.results?.[0];
  const components = result?.address_components ?? [];
  const district = addressComponent(components, "administrative_area_level_2");
  const city = addressComponent(components, "locality")
    || addressComponent(components, "postal_town")
    || addressComponent(components, "administrative_area_level_3")
    || district;
  const area = addressComponent(components, "sublocality_level_1")
    || addressComponent(components, "sublocality")
    || addressComponent(components, "neighborhood")
    || addressComponent(components, "route");

  return {
    ...location,
    address: String(result?.formatted_address ?? `${location.lat}, ${location.lng}`),
    area,
    city,
    district,
    state: addressComponent(components, "administrative_area_level_1"),
    pincode: addressComponent(components, "postal_code"),
  };
}

export async function getCurrentIndianLocation() {
  const gps = await getBrowserLocation();
  try {
    return await resolveIndianLocation(gps);
  } catch {
    return { ...gps, address: `${gps.lat}, ${gps.lng}`, area: "", city: "", district: "", state: "", pincode: "" };
  }
}

function normalizePosition(position: GeolocationPosition): LiveLocation {
  return {
    lat: Number(position.coords.latitude.toFixed(6)),
    lng: Number(position.coords.longitude.toFixed(6)),
    accuracy: position.coords.accuracy ? Math.round(position.coords.accuracy) : undefined,
    speed: position.coords.speed ? Math.max(0, Math.round(position.coords.speed * 3.6)) : undefined,
    heading: position.coords.heading !== null && position.coords.heading !== undefined ? Math.round(position.coords.heading) : undefined,
    capturedAt: new Date().toISOString(),
  };
}

export function getBrowserLocation(): Promise<LiveLocation> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.reject(new Error("Live location is not available on this device."));
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve(normalizePosition(position));
      },
      (error) => {
        const message =
          error.code === error.PERMISSION_DENIED
            ? "Location permission is required for delivery tracking."
            : "Could not capture your live location. Please try again.";
        reject(new Error(message));
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  });
}

export function watchBrowserLocation(
  onLocation: (location: LiveLocation) => void,
  onError: (error: Error) => void,
): () => void {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    onError(new Error("Live location is not available on this device."));
    return () => undefined;
  }

  const id = navigator.geolocation.watchPosition(
    (position) => onLocation(normalizePosition(position)),
    (error) => {
      const message =
        error.code === error.PERMISSION_DENIED
          ? "Location permission is required for live delivery tracking."
          : "Live GPS temporarily unavailable. Keep GPS and internet on.";
      onError(new Error(message));
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
  );

  return () => navigator.geolocation.clearWatch(id);
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.type.startsWith("image/")) {
      const image = new Image();
      const objectUrl = URL.createObjectURL(file);
      image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const maxSide = 900;
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Could not prepare the selected photo."));
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Could not read the selected photo."));
      };
      image.src = objectUrl;
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the selected photo."));
    reader.readAsDataURL(file);
  });
}
