import { setBaseUrl } from "@workspace/api-client-react";

function isLocalhostUrl(value?: string | null) {
  return Boolean(value && /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?/i.test(value.trim()));
}

export async function initMobileRuntime() {
  const isNative = Boolean((window as any).Capacitor?.isNativePlatform?.());
  document.documentElement.classList.toggle("capacitor-native", isNative);
  const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();
  const mobileApiUrl = import.meta.env.VITE_MOBILE_API_URL?.trim();
  const apiUrl = isNative && isLocalhostUrl(configuredApiUrl)
    ? mobileApiUrl || "http://10.0.2.2:5000"
    : configuredApiUrl;
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
