"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Layers, Settings } from "lucide-react";
import type { ReactNode } from "react";

interface NavItem {
  href: string;
  matchPrefixes: string[];
  label: string;
  icon: typeof Home;
}

const NAV_ITEMS: NavItem[] = [
  {
    href: "/create",
    matchPrefixes: ["/", "/create"],
    label: "Create 3D",
    icon: Home,
  },
  {
    href: "/models",
    matchPrefixes: ["/models"],
    label: "My Models",
    icon: Layers,
  },
  {
    href: "/settings",
    matchPrefixes: ["/settings"],
    label: "Settings",
    icon: Settings,
  },
];

function Vision3DMark() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        d="M14 2.75L24 8.5V19.5L14 25.25L4 19.5V8.5L14 2.75Z"
        stroke="#F79448"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
      <path
        d="M14 2.75V14M14 14L24 8.5M14 14L4 8.5M14 14V25.25"
        stroke="#F79448"
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeOpacity="0.82"
      />
    </svg>
  );
}

export interface AppShellProps {
  children: ReactNode;
  backendOnline?: boolean | null;
}

export function AppShell({ children, backendOnline }: AppShellProps) {
  const pathname = usePathname();

  const isActive = (item: NavItem) => {
    if (item.href === "/create") {
      return pathname === "/" || pathname.startsWith("/create");
    }
    return item.matchPrefixes.some((prefix) => pathname.startsWith(prefix));
  };

  return (
    <div className="studio-ambient-bg min-h-dvh flex flex-col lg:flex-row">
      {/* Desktop Narrow Sidebar */}
      <aside
        aria-label="Primary navigation"
        className="hidden lg:flex lg:w-[228px] lg:shrink-0 lg:flex-col border-r border-border-subtle/80 bg-[#121214]/90 px-4 py-6"
      >
        <Link
          href="/create"
          className="flex items-center gap-2.5 px-2 mb-8 rounded-lg focus-visible:outline-2"
        >
          <Vision3DMark />
          <span className="text-[19px] font-semibold tracking-tight text-ink-primary">
            Vision3D
          </span>
          <span className="ml-auto rounded-md border border-border-subtle bg-raised px-2 py-0.5 text-[11px] font-medium text-ink-secondary">
            Studio
          </span>
        </Link>

        <nav className="flex flex-col gap-1.5" aria-label="Workspace">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-copper/14 text-ink-primary border border-copper/25"
                    : "text-ink-secondary border border-transparent hover:bg-raised/70 hover:text-ink-primary"
                }`}
              >
                <Icon
                  className={`h-[18px] w-[18px] shrink-0 ${
                    active ? "text-copper" : "text-ink-secondary"
                  }`}
                  strokeWidth={1.75}
                />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto pt-6">
          <div className="rounded-2xl border border-border-subtle bg-panel/85 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-ink-secondary">
                Backend API
              </span>
              <span
                className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                  backendOnline === true
                    ? "text-emerald-400"
                    : backendOnline === false
                    ? "text-copper"
                    : "text-ink-muted"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    backendOnline === true
                      ? "bg-emerald-400"
                      : backendOnline === false
                      ? "bg-copper"
                      : "bg-ink-muted"
                  }`}
                />
                {backendOnline === true
                  ? "Connected"
                  : backendOnline === false
                  ? "Offline"
                  : "Checking"}
              </span>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-ink-muted">
              {backendOnline === true
                ? "Connected to server-side inference API."
                : "Start the FastAPI backend to submit real 2D-to-3D jobs."}
            </p>
          </div>
        </div>
      </aside>

      {/* Mobile Top Header */}
      <header className="flex lg:hidden items-center justify-between border-b border-border-subtle bg-[#121214]/95 px-4 py-3 sticky top-0 z-30">
        <Link href="/create" className="flex items-center gap-2">
          <Vision3DMark />
          <span className="text-base font-semibold tracking-tight text-ink-primary">
            Vision3D
          </span>
        </Link>

        <span
          className={`inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-panel px-2.5 py-1 text-[11px] font-medium ${
            backendOnline === true
              ? "text-emerald-400"
              : backendOnline === false
              ? "text-copper"
              : "text-ink-muted"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              backendOnline === true
                ? "bg-emerald-400"
                : backendOnline === false
                ? "bg-copper"
                : "bg-ink-muted"
            }`}
          />
          {backendOnline === true
            ? "API Ready"
            : backendOnline === false
            ? "API Offline"
            : "Checking"}
        </span>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 pb-20 lg:pb-0">{children}</main>

      {/* Mobile Bottom Navigation */}
      <nav
        aria-label="Mobile navigation"
        className="fixed bottom-0 inset-x-0 z-30 flex lg:hidden items-center justify-around border-t border-border-subtle bg-[#121214]/95 backdrop-blur-md px-2 py-1.5"
      >
        {NAV_ITEMS.map((item) => {
          const active = isActive(item);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-[44px] min-w-[80px] flex-col items-center justify-center gap-1 rounded-xl px-3 py-1.5 text-[11px] font-medium transition-colors ${
                active ? "text-copper bg-copper/10" : "text-ink-secondary"
              }`}
            >
              <Icon className="h-5 w-5" strokeWidth={1.75} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
