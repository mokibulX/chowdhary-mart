import { fileToDataUrl } from "@/lib/live-location";
import { resolveRuntimeApiUrl } from "@/lib/mobile-runtime";

export type UploadedImage = {
  imageUrl: string;
  storagePath: string;
  provider: string;
  mime: string;
  sizeBytes: number;
};

export async function uploadImageFile(file: File, folder = "general"): Promise<UploadedImage> {
  const dataUrl = await fileToDataUrl(file);
  const token = localStorage.getItem("token");
  const response = await fetch(resolveRuntimeApiUrl("/api/uploads/image"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      dataUrl,
      folder,
      fileName: file.name,
    }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || data?.message || "Image upload failed");
  }

  return response.json() as Promise<UploadedImage>;
}
