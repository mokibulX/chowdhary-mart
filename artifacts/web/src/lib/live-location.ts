export type LiveLocation = {
  lat: number;
  lng: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  capturedAt: string;
};

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
