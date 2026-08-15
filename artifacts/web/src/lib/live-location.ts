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
    if (!file.size) {
      reject(new Error("The selected photo is empty. Please take it again."));
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      reject(new Error("Photo is too large. Please use a photo under 25 MB."));
      return;
    }

    const extension = file.name.split(".").pop()?.toLowerCase();
    const inferredMime: Record<string, string> = {
      jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
      gif: "image/gif", heic: "image/heic", heif: "image/heif",
    };
    const readableFile = file.type.startsWith("image/")
      ? file
      : new Blob([file], { type: inferredMime[extension ?? ""] ?? "image/jpeg" });
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const finish = (value: string) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const compress = (source: CanvasImageSource, sourceWidth: number, sourceHeight: number) => {
      const maxSide = 1200;
      const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(sourceWidth * scale));
      canvas.height = Math.max(1, Math.round(sourceHeight * scale));
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Could not prepare the selected photo.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      const compressed = canvas.toDataURL("image/jpeg", 0.7);
      if (!compressed.startsWith("data:image/jpeg;base64,")) throw new Error("Photo compression failed.");
      return compressed;
    };
    const reader = new FileReader();
    reader.onload = () => {
      const source = String(reader.result ?? "");
      if (!source.startsWith("data:image/")) {
        fail(new Error("This file is not a supported image."));
        return;
      }
      const image = new Image();
      const timer = window.setTimeout(() => fail(new Error("Photo reading timed out. Please take the photo again.")), 30000);
      image.onload = () => {
        window.clearTimeout(timer);
        try {
          finish(compress(image, image.naturalWidth || image.width, image.naturalHeight || image.height));
        } catch (error) {
          fail(error instanceof Error ? error : new Error("Could not prepare the selected photo."));
        }
      };
      image.onerror = async () => {
        window.clearTimeout(timer);
        try {
          if (!("createImageBitmap" in window)) throw new Error("Decoder unavailable");
          const bitmap = await createImageBitmap(readableFile);
          try {
            finish(compress(bitmap, bitmap.width, bitmap.height));
          } finally {
            bitmap.close();
          }
        } catch {
          const heic = /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
          fail(new Error(heic
            ? "This phone saved the photo as HEIC. Turn off High efficiency pictures in Camera settings, then take the photo again."
            : "Could not decode this photo. Please retake it or choose a JPG, PNG or WEBP image."));
        }
      };
      image.src = source;
    };
    reader.onerror = () => fail(new Error("Could not read the selected photo. Please take it again."));
    reader.onabort = () => fail(new Error("Photo selection was cancelled."));
    reader.readAsDataURL(readableFile);
  });
}
