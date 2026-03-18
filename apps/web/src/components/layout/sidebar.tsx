"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Library,
  ScanLine,
  DollarSign,
  Bell,
  Store,
  ShoppingCart,
  Settings,
  X,
} from "lucide-react";

const navigation = [
  { name: "Home", href: "/", icon: LayoutDashboard },
  { name: "Binder", href: "/cards", icon: Library },
  { name: "Pull", href: "/scan", icon: ScanLine },
  { name: "Comps", href: "/prices", icon: DollarSign },
  { name: "Wax Alerts", href: "/prices/alerts", icon: Bell },
  { name: "Vendors", href: "/vendors", icon: Store },
  { name: "Deals", href: "/vendors/deals", icon: ShoppingCart },
  { name: "Settings", href: "/settings", icon: Settings },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={onClose} />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-card border-r border-border transition-transform duration-200 lg:translate-x-0 lg:static lg:z-auto",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo */}
        <div className="flex h-14 items-center justify-between px-6 border-b border-border">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-7 h-7 border border-[var(--color-h-light)] rounded-[2px] flex items-center justify-center">
              <span style={{ fontFamily: "var(--font-display)" }} className="text-[15px] text-[var(--color-h-light)]">H</span>
            </div>
            <span style={{ fontFamily: "var(--font-display)" }} className="text-[19px] text-[var(--color-h-light)]">
              Holdsworth
            </span>
          </Link>
          <button onClick={onClose} className="lg:hidden text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navigation.map((item) => {
            const isActive =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-[var(--color-burg-light)]"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-border p-4">
          <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-[0.06em] text-muted-foreground">
            Holdsworth v0.1
          </p>
        </div>
      </aside>
    </>
  );
}
