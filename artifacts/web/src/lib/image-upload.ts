import { customFetch } from "@workspace/api-client-react";
import { fileToDataUrl } from "@/lib/live-location";

export type UploadedImage = {
  imageUrl: string;
  storagePath: string;
  provider: string;
  mime: string;
  sizeBytes: number;
};

export async function uploadImageFile(file: File, folder = "general"): Promise<UploadedImage> {
  const dataUrl = await fileToDataUrl(file);
  return customFetch<UploadedImage>("/api/uploads/image", {
    method: "POST",
    body: JSON.stringify({
      dataUrl,
      folder,
      fileName: file.name,
    }),
  });
}
