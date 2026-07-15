import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initMobileRuntime } from "./lib/mobile-runtime";

void initMobileRuntime();
createRoot(document.getElementById("root")!).render(<App />);
