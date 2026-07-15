import { setBaseUrl } from "@workspace/api-client-react";

export async function initMobileRuntime() {
  const apiUrl = import.meta.env.VITE_API_URL?.trim();
  if (apiUrl) setBaseUrl(apiUrl);

  const isNative = Boolean((window as any).Capacitor?.isNativePlatform?.());
  document.documentElement.classList.toggle("capacitor-native", isNative);

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
