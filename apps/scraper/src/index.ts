import "dotenv/config";
import { startWorker, stopWorker } from "./worker";

// Load .env.local manually since dotenv/config only reads .env
import { readFileSync } from "fs";
import { resolve } from "path";

try {
  const envPath = resolve(import.meta.dirname, "../.env.local");
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.substring(0, eqIdx).trim();
    const value = trimmed.substring(eqIdx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
} catch {
  // .env.local not found, rely on environment variables
}

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down pricing engine...");
  stopWorker();
  setTimeout(() => process.exit(0), 2000);
});

process.on("SIGTERM", () => {
  stopWorker();
  setTimeout(() => process.exit(0), 2000);
});

// Start
console.log("╔══════════════════════════════════════╗");
console.log("║   Holdsworth Pricing Engine v0.1     ║");
console.log("╚══════════════════════════════════════╝");
console.log("");

startWorker().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
