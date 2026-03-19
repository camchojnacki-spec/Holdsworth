// Load .env.local BEFORE any other imports (db reads DATABASE_URL at import time)
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

try {
  const envPath = resolve(__dirname, "../.env.local");
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
  console.log("Loaded .env.local");
} catch (e) {
  console.log("No .env.local found, using environment variables");
}

// Now import worker (which imports @holdsworth/db which reads DATABASE_URL)
const { startWorker, stopWorker } = await import("./worker");

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
