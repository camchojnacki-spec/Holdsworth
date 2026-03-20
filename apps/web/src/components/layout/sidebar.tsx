"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Library,
  ScanLine,
  DollarSign,
  Store,
  Settings,
  X,
  ChevronDown,
  LogOut,
  BarChart3,
} from "lucide-react";

const navigation = [
  { name: "Home", href: "/", icon: LayoutDashboard },
  { name: "Dashboard", href: "/dashboard", icon: BarChart3 },
  { name: "Binder", href: "/cards", icon: Library },
  {
    name: "Pull",
    icon: ScanLine,
    children: [
      { name: "Single Scan", href: "/scan" },
      { name: "Batch Scan", href: "/scan/batch" },
      { name: "Pack Rip", href: "/scan/rip" },
    ],
  },
  { name: "Portfolio", href: "/prices", icon: DollarSign },
  {
    name: "Market",
    icon: Store,
    children: [
      { name: "Wax Alerts", href: "/prices/alerts" },
      { name: "Vendors", href: "/vendors" },
      { name: "Deals", href: "/vendors/deals" },
    ],
  },
  { name: "Settings", href: "/settings", icon: Settings },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  user?: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  } | null;
}

export function Sidebar({ open, onClose, user }: SidebarProps) {
  const pathname = usePathname();
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (name: string, currentlyExpanded: boolean) => {
    setExpandedGroups(prev => ({ ...prev, [name]: !currentlyExpanded }));
  };

  // Auto-expand Market if user is on a Market sub-page
  const isMarketActive = pathname.startsWith("/prices/alerts") || pathname.startsWith("/vendors");
  // Auto-expand Pull if user is on a scan sub-page
  const isPullActive = pathname.startsWith("/scan");

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
            // Collapsible group (Pull, Market, etc.)
            if ("children" in item && item.children) {
              const isGroupActive = item.name === "Market" ? isMarketActive
                : item.name === "Pull" ? isPullActive
                : false;
              const expanded = expandedGroups[item.name] ?? isGroupActive;
              return (
                <div key={item.name}>
                  <button
                    onClick={() => toggleGroup(item.name, expanded)}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors w-full",
                      isGroupActive
                        ? "text-[var(--color-burg-light)]"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.name}
                    <ChevronDown className={cn("h-3 w-3 ml-auto transition-transform", expanded && "rotate-180")} />
                  </button>
                  {expanded && (
                    <div className="ml-7 mt-0.5 space-y-0.5">
                      {item.children.map((child) => {
                        const childActive = child.href === "/scan" ? pathname === "/scan" : pathname.startsWith(child.href);
                        return (
                          <Link
                            key={child.name}
                            href={child.href}
                            onClick={onClose}
                            className={cn(
                              "flex items-center rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors",
                              childActive
                                ? "bg-primary/10 text-[var(--color-burg-light)]"
                                : "text-muted-foreground hover:bg-accent hover:text-foreground"
                            )}
                          >
                            {child.name}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            // Regular nav item
            const href = (item as { href: string }).href;
            const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={item.name}
                href={href}
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

        {/* Footer — user info + sign out */}
        <div className="border-t border-border p-4">
          {user ? (
            <div className="flex items-center gap-3">
              {user.image ? (
                <img
                  src={user.image}
                  alt=""
                  className="h-7 w-7 rounded-full border border-border"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-burg)] text-xs font-medium text-[var(--color-h-white)]">
                  {(user.name ?? user.email ?? "U").charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="truncate text-xs font-medium text-foreground">
                  {user.name ?? user.email}
                </p>
              </div>
              <form action="/api/auth/signout" method="post">
                <button
                  type="submit"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title="Sign out"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </form>
            </div>
          ) : (
            <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-[0.06em] text-muted-foreground">
              Holdsworth v0.1
            </p>
          )}
        </div>
      </aside>
    </>
  );
}
