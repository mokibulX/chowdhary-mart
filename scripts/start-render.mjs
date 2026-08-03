import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const apiEntry = path.join(root, "artifacts", "api-server", "dist", "index.mjs");
const webIndex = path.join(root, "artifacts", "web", "dist", "public", "index.html");

const command = existsSync(apiEntry)
  ? ["pnpm", ["--filter", "@workspace/api-server", "run", "start"]]
  : existsSync(webIndex)
    ? ["pnpm", ["--filter", "@workspace/web", "run", "serve"]]
    : null;

if (!command) {
  console.error("No Render build output found. Run the API or web build command before starting.");
  process.exit(1);
}

const [rawBin, args] = command;
const bin = process.platform === "win32" ? `${rawBin}.cmd` : rawBin;
const child = spawn(bin, args, {
  cwd: root,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
