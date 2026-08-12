import { setBaseUrl } from "@workspace/api-client-react";

export function isNativeAppRuntime() {
  return Boolean((window as any).Capacitor?.isNativePlatform?.());
}

export function isLocalhostUrl(value?: string | null) {
  return Boolean(value && /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?/i.test(value.trim()));
}

export function toWebsocketUrl(value: string) {
  return value.replace(/^https:\/\//i, "wss://").replace(/^http:\/\//i, "ws://");
}

export function getRuntimeApiBaseUrl() {
  const isNative = isNativeAppRuntime();
  const publicApiUrl = import.meta.env.VITE_PUBLIC_API_URL?.trim();
  const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();
  const mobileApiUrl = import.meta.env.VITE_MOBILE_API_URL?.trim();
  const isRemoteWebHost = typeof window !== "undefined" && !isLocalhostUrl(window.location.origin);
  if (!isNative && isRemoteWebHost && isLocalhostUrl(configuredApiUrl)) return publicApiUrl || "";
  if (isNative && publicApiUrl) return publicApiUrl;
  if (isNative && isLocalhostUrl(configuredApiUrl)) return mobileApiUrl || publicApiUrl || "http://10.0.2.2:5000";
  return configuredApiUrl || publicApiUrl || "";
}

export function getRuntimeWebsocketUrl() {
  const isNative = isNativeAppRuntime();
  const publicWsUrl = import.meta.env.VITE_PUBLIC_WEBSOCKET_URL?.trim();
  const configuredWsUrl = import.meta.env.VITE_WEBSOCKET_URL?.trim();
  const mobileWsUrl = import.meta.env.VITE_MOBILE_WEBSOCKET_URL?.trim();
  const apiUrl = getRuntimeApiBaseUrl();
  const isRemoteWebHost = typeof window !== "undefined" && !isLocalhostUrl(window.location.origin);
  if (!isNative && isRemoteWebHost && isLocalhostUrl(configuredWsUrl)) {
    if (publicWsUrl) return publicWsUrl;
    if (apiUrl) return toWebsocketUrl(apiUrl);
    return window.location.origin.replace(/^https:\/\//i, "wss://").replace(/^http:\/\//i, "ws://");
  }
  if (isNative && publicWsUrl) return publicWsUrl;
  if (isNative && isLocalhostUrl(configuredWsUrl)) {
    if (mobileWsUrl) return mobileWsUrl;
    if (apiUrl) return toWebsocketUrl(apiUrl);
    return "ws://10.0.2.2:5000";
  }
  return configuredWsUrl || publicWsUrl || (apiUrl ? toWebsocketUrl(apiUrl) : window.location.origin);
}

export function resolveRuntimeApiUrl(path: string) {
  const apiUrl = getRuntimeApiBaseUrl();
  if (!apiUrl || !path.startsWith("/")) return path;
  return `${apiUrl.replace(/\/+$/, "")}${path}`;
}

export async function initMobileRuntime() {
  const isNative = isNativeAppRuntime();
  document.documentElement.classList.toggle("capacitor-native", isNative);
  const apiUrl = getRuntimeApiBaseUrl();
  if (apiUrl) setBaseUrl(apiUrl);

  if (!isNative) return;

  const [{ StatusBar, Style }, { SplashScreen }, { Network }, { App }] = await Promise.all([
    import("@capacitor/status-bar"),
    import("@capacitor/splash-screen"),
    import("@capacitor/network"),
    import("@capacitor/app"),
  ]);

  await StatusBar.setStyle({ style: Style.Light }).catch(() => undefined);
  await StatusBar.setBackgroundColor({ color: "#0757ee" }).catch(() => undefined);
  await SplashScreen.hide().catch(() => undefined);

  const applyNetwork = (connected: boolean) => {
    document.documentElement.classList.toggle("is-offline", !connected);
    window.dispatchEvent(new CustomEvent("cm-network-change", { detail: { connected } }));
  };
  const status = await Network.getStatus().catch(() => ({ connected: true }));
  applyNetwork(status.connected);
  await Network.addListener("networkStatusChange", (next) => applyNetwork(next.connected));

  let lastHomeBack = 0;
  await App.addListener("backButton", ({ canGoBack }) => {
    const modalOpen = document.querySelector("[data-state='open']");
    if (modalOpen) {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      return;
    }
    if (window.location.pathname !== "/" && canGoBack) {
      window.history.back();
      return;
    }
    const now = Date.now();
    if (now - lastHomeBack < 1800) {
      void App.exitApp();
      return;
    }
    lastHomeBack = now;
    window.dispatchEvent(new CustomEvent("cm-toast", { detail: { title: "Press back again to exit" } }));
  });
}
