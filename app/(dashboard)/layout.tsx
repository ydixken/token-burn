"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Crosshair,
  FileText,
  Play,
  Layers,
  GitCompare,
  BarChart3,
  Settings,
  BookOpen,
  Code2,
  ChevronLeft,
  ChevronRight,
  Zap,
  Search,
} from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import { CommandPalette } from "@/components/ui/command-palette";
import { KeyboardShortcuts } from "@/components/ui/keyboard-shortcuts";
import { ToastProvider } from "@/components/ui/toast";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: "Testing",
    items: [
      { label: "Dashboard", href: "/", icon: LayoutDashboard },
      { label: "Targets", href: "/targets", icon: Crosshair },
      { label: "Scenarios", href: "/scenarios", icon: FileText },
    ],
  },
  {
    title: "Execution",
    items: [
      { label: "Sessions", href: "/sessions", icon: Play },
      { label: "Batches", href: "/batches", icon: Layers },
    ],
  },
  {
    title: "Analysis",
    items: [
      { label: "Compare", href: "/compare", icon: GitCompare },
      { label: "Metrics", href: "/metrics", icon: BarChart3 },
    ],
  },
  {
    title: "System",
    items: [
      { label: "Settings", href: "/settings", icon: Settings },
      { label: "Guide", href: "/guide", icon: BookOpen },
      { label: "API Docs", href: "/api-docs", icon: Code2 },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(true);
  const [activeSessions, setActiveSessions] = useState(0);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch("/api/dashboard/stats");
        if (res.ok) {
          const data = await res.json();
          setActiveSessions(data.data?.counts?.activeSessions ?? 0);
        }
      } catch {
        // Silently fail
      }
    }
    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <ToastProvider>
    <div className="flex h-screen bg-gray-950 text-gray-100">
      <CommandPalette />
      <KeyboardShortcuts />
      {/* Sidebar */}
      <aside
        className={`flex flex-col border-r border-gray-800 bg-gray-900 transition-all duration-200 ${
          collapsed ? "w-14" : "w-60"
        }`}
      >
        {/* Logo */}
        <div className="flex h-14 items-center border-b border-gray-800 px-3">
          <a href="/" className="flex items-center gap-2.5 min-w-0">
            <Zap className="h-5 w-5 text-blue-500 shrink-0" />
            {!collapsed && (
              <span className="text-sm font-semibold text-gray-100 truncate">
                Krawall
              </span>
            )}
          </a>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2 px-1.5">
          {NAV_GROUPS.map((group) => (
            <div key={group.title} className="mb-3">
              {!collapsed && (
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  {group.title}
                </div>
              )}
              {group.items.map((item) => {
                const active = isActive(pathname, item.href);
                const Icon = item.icon;
                const link = (
                  <a
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors relative ${
                      active
                        ? "bg-blue-500/10 text-blue-400"
                        : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
                    }`}
                  >
                    {active && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-blue-500 rounded-full" />
                    )}
                    <Icon className={`h-4 w-4 shrink-0 ${active ? "text-blue-400" : ""}`} />
                    {!collapsed && (
                      <span className="truncate">{item.label}</span>
                    )}
                  </a>
                );

                return collapsed ? (
                  <Tooltip key={item.href} content={item.label}>
                    {link}
                  </Tooltip>
                ) : (
                  link
                );
              })}
            </div>
          ))}
        </nav>

        {/* Bottom */}
        <div className="border-t border-gray-800 p-1.5">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex w-full items-center justify-center rounded-md p-1.5 text-gray-500 hover:bg-gray-800 hover:text-gray-300 transition-colors"
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-col flex-1 overflow-hidden min-w-0">
        {/* Header */}
        <header className="flex h-14 items-center justify-between border-b border-gray-800 bg-gray-900/50 px-4">
          <div className="flex items-center gap-3 min-w-0">
            {/* Command palette trigger */}
            <button
              className="hidden sm:flex items-center gap-2 rounded-md border border-gray-700 bg-gray-800/50 px-3 py-1.5 text-xs text-gray-400 hover:border-gray-600 hover:text-gray-300 transition-colors"
              onClick={() => {
                const event = new KeyboardEvent("keydown", { key: "k", metaKey: true });
                document.dispatchEvent(event);
              }}
            >
              <Search className="h-3.5 w-3.5" />
              <span>Search...</span>
              <kbd className="ml-1 rounded border border-gray-600 bg-gray-700/50 px-1 py-0.5 text-[10px] font-mono">
                ⌘K
              </kbd>
            </button>
          </div>

          <div className="flex items-center gap-3">
            {activeSessions > 0 && (
              <a
                href="/sessions?status=RUNNING"
                className="flex items-center gap-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 px-2.5 py-1 text-xs text-blue-400 hover:bg-blue-500/20 transition-colors"
              >
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
                </span>
                {activeSessions} session{activeSessions !== 1 ? "s" : ""} running
              </a>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
    </ToastProvider>
  );
}
