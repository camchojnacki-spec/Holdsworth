"use client";

import { useEffect, useState, useCallback } from "react";

const DISMISS_KEY = "holdsworth-install-dismissed";
const DISMISS_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 days

async function checkForCards(): Promise<boolean> {
  try {
    const res = await fetch("/api/cards?limit=1");
    if (!res.ok) return false;
    const data = await res.json();
    return Array.isArray(data.cards) ? data.cards.length > 0 : (data.total ?? 0) > 0;
  } catch {
    return false;
  }
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Check if dismissed recently
    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (dismissed) {
      const dismissedAt = parseInt(dismissed, 10);
      if (Date.now() - dismissedAt < DISMISS_DURATION) return;
    }

    // Check if already installed (standalone mode)
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Only show after user has scanned at least one card
      checkForCards().then((hasCards) => {
        if (hasCards) {
          setTimeout(() => setVisible(true), 2000);
        }
      });
    };

    window.addEventListener("beforeinstallprompt", handler);

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setVisible(false);
    }
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
    setDeferredPrompt(null);
  }, []);

  if (!visible) return null;

  return (
    <div
      role="banner"
      aria-label="Install Holdsworth app"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        padding: "1rem",
        animation: "slideUp 0.3s ease-out",
      }}
    >
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
      <div
        style={{
          maxWidth: "480px",
          margin: "0 auto",
          background: "#1a1a1a",
          border: "1px solid #2a2a2a",
          borderRadius: "12px",
          padding: "1rem 1.25rem",
          display: "flex",
          alignItems: "center",
          gap: "1rem",
          boxShadow: "0 -4px 24px rgba(0,0,0,0.4)",
        }}
      >
        {/* Icon */}
        <div style={{ flexShrink: 0 }}>
          <svg width="40" height="40" viewBox="0 0 192 192" xmlns="http://www.w3.org/2000/svg">
            <rect width="192" height="192" rx="24" fill="#8B2252" />
            <text
              x="96"
              y="132"
              textAnchor="middle"
              fontFamily="Georgia, 'Times New Roman', serif"
              fontSize="128"
              fontWeight="bold"
              fill="#fff"
            >
              H
            </text>
          </svg>
        </div>

        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 600,
              color: "#f0f0f0",
              fontSize: "0.95rem",
              marginBottom: "2px",
            }}
          >
            Install Holdsworth for quick access
          </div>
          <div style={{ color: "#888", fontSize: "0.8rem" }}>
            Add to your home screen to scan cards faster
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
          <button
            onClick={handleDismiss}
            style={{
              background: "transparent",
              border: "1px solid #333",
              color: "#888",
              borderRadius: "8px",
              padding: "0.4rem 0.75rem",
              fontSize: "0.8rem",
              cursor: "pointer",
            }}
          >
            Dismiss
          </button>
          <button
            onClick={handleInstall}
            style={{
              background: "#8B2252",
              border: "none",
              color: "#fff",
              borderRadius: "8px",
              padding: "0.4rem 0.75rem",
              fontSize: "0.8rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Install
          </button>
        </div>
      </div>
    </div>
  );
}
