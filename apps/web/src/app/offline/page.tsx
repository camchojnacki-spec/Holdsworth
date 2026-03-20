"use client";

import { useEffect, useState } from "react";

export default function OfflinePage() {
  const [cachedCount, setCachedCount] = useState<number | null>(null);

  useEffect(() => {
    // Try to get cached collection count from the API cache
    async function getCachedCount() {
      try {
        const cache = await caches.open("holdsworth-dynamic-v2");
        const keys = await cache.keys();
        const cardsRequest = keys.find((req) => req.url.includes("/api/cards"));
        if (cardsRequest) {
          const response = await cache.match(cardsRequest);
          if (response) {
            const data = await response.json();
            const count = data.total ?? (Array.isArray(data.cards) ? data.cards.length : null);
            if (count !== null) setCachedCount(count);
          }
        }
      } catch {
        // Cache unavailable
      }
    }
    getCachedCount();
  }, []);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      {/* Logo */}
      <div className="mb-8">
        <svg
          width="80"
          height="80"
          viewBox="0 0 192 192"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect width="192" height="192" rx="24" fill="#1a1a1a" />
          <text
            x="96"
            y="132"
            textAnchor="middle"
            fontFamily="Georgia, 'Times New Roman', serif"
            fontSize="128"
            fontWeight="bold"
            fill="#8B2252"
          >
            H
          </text>
        </svg>
      </div>

      <h1
        className="mb-2 text-3xl font-normal tracking-wide"
        style={{ fontFamily: "Georgia, 'Times New Roman', serif", color: "#8B2252" }}
      >
        Holdsworth
      </h1>

      <h2 className="mb-4 text-xl text-zinc-400">You&apos;re offline</h2>

      {/* Pulse indicator */}
      <div className="mb-6 h-3 w-3 animate-pulse rounded-full bg-zinc-600" />

      <p className="mb-6 max-w-sm text-sm leading-relaxed text-zinc-500">
        Holdsworth requires an internet connection for card scanning and pricing.
        Check your network connection and try again.
      </p>

      {cachedCount !== null && (
        <p className="mb-6 text-sm text-zinc-400">
          {cachedCount} {cachedCount === 1 ? "card" : "cards"} in your cached collection
        </p>
      )}

      <button
        onClick={() => window.location.reload()}
        className="rounded-lg px-8 py-3 text-white transition-opacity hover:opacity-85"
        style={{ backgroundColor: "#8B2252" }}
      >
        Retry
      </button>
    </div>
  );
}
