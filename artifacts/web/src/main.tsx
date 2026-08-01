import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initMobileRuntime } from "./lib/mobile-runtime";

void initMobileRuntime();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/cm-map-cache-sw.js").catch(() => undefined);
  });
}

createRoot(document.getElementById("root")!).render(<App />);
