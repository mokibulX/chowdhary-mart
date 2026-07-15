import { getStorageConfig } from "../env";

export type StorageHealth = {
  provider: string;
  configured: boolean;
  bucket?: string;
  publicBaseUrl?: string;
};

export function getStorageHealth(): StorageHealth {
  const config = getStorageConfig();
  return {
    provider: config.provider,
    configured: config.configured,
    bucket: config.bucket,
    publicBaseUrl: config.publicBaseUrl,
  };
}
