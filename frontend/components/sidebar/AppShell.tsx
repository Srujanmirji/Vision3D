"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Layers, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui";
import type { InferenceState } from "@/lib/api";

export const inferenceText: Record<InferenceState, string> = {
  unconfigured: "Inference unavailable",
  unverified: "Inference unverified",
  busy: "Inference busy",
  ready: "Inference ready",
  degraded: "Last generation failed",
};

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
      width="24"
      height="24"
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
  inferenceState?: InferenceState;
}

export function AppShell({ children, backendOnline, inferenceState }: AppShellProps) {
  const pathname = usePathname();

  const isActive = (item: NavItem) => {
    if (item.href === "/create") {
      return pathname.startsWith("/create");
    }
    return item.matchPrefixes.some((prefix) => pathname.startsWith(prefix));
  };

  const statusTone =
    backendOnline === true
      ? "success"
      : backendOnline === false
      ? "copper"
      : "neutral";

  const statusText =
    backendOnline === true
      ? "Connected"
      : backendOnline === false
      ? "Offline"
      : "Checking";

  return (
    <div className="studio-ambient-bg min-h-dvh flex flex-col lg:flex-row">
      {/* Desktop Narrow Sidebar */}
      <aside
        aria-label="Primary navigation"
        className="hidden lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-[224px] lg:shrink-0 lg:flex-col lg:overflow-y-auto border-r border-border-subtle bg-[#121214]/92 px-3.5 py-5"
      >
        <Link
          href="/"
          className="flex items-center gap-2.5 px-2 mb-7 rounded-[8px]"
        >
          <Vision3DMark />
          <span className="text-[17px] font-semibold tracking-tight text-ink-primary">
            Vision3D
          </span>
          <span className="ml-auto rounded-[6px] border border-border-subtle bg-raised px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-ink-secondary">
            Studio
          </span>
        </Link>

        <nav className="flex flex-col gap-1" aria-label="Workspace">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[13px] font-medium transition-colors ${
                  active
                    ? "bg-copper/14 text-ink-primary border border-copper/25"
                    : "text-ink-secondary border border-transparent hover:bg-raised/70 hover:text-ink-primary"
                }`}
              >
                <Icon
                  className={`h-[17px] w-[17px] shrink-0 ${
                    active ? "text-copper" : "text-ink-secondary"
                  }`}
                  strokeWidth={1.75}
                />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto pt-5">
          <div className="rounded-[12px] border border-border-subtle bg-panel/90 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-ink-secondary">
                Backend API
              </span>
              <Badge tone={statusTone} dot>
                {statusText}
              </Badge>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">
              {backendOnline === true
                ? inferenceText[inferenceState ?? "unverified"]
                : "Live generation requires a connection to the API."}
            </p>
          </div>
        </div>
      </aside>

      {/* Tablet & Mobile Top Navigation Header */}
      <header className="flex lg:hidden items-center justify-between gap-4 border-b border-border-subtle bg-[#121214]/95 backdrop-blur-md px-4 py-3 sticky top-0 z-30">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <Vision3DMark />
          <span className="text-[15px] font-semibold tracking-tight text-ink-primary">
            Vision3D
          </span>
        </Link>

        {/* Tablet inline nav tabs (md..lg) */}
        <nav
          aria-label="Tablet navigation"
          className="hidden md:flex items-center gap-1 rounded-[10px] border border-border-subtle bg-panel p-1"
        >
          {NAV_ITEMS.map((item) => {
            const active = isActive(item);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex items-center gap-2 rounded-[8px] px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "bg-copper/15 text-ink-primary"
                    : "text-ink-secondary hover:text-ink-primary"
                }`}
              >
                <Icon
                  className={`h-3.5 w-3.5 ${active ? "text-copper" : ""}`}
                  strokeWidth={1.75}
                />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <Badge tone={statusTone} dot>
          {backendOnline === true
            ? inferenceText[inferenceState ?? "unverified"]
            : backendOnline === false
            ? "API Offline"
            : "Checking"}
        </Badge>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 pb-24 md:pb-0">{children}</main>

      {/* Mobile Bottom Navigation (< md) with safe-area padding */}
      <nav
        aria-label="Mobile navigation"
        className="fixed bottom-0 inset-x-0 z-30 flex md:hidden items-center justify-around border-t border-border-subtle bg-[#121214]/95 backdrop-blur-md px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      >
        {NAV_ITEMS.map((item) => {
          const active = isActive(item);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`relative flex min-h-[48px] min-w-[88px] flex-col items-center justify-center gap-1 rounded-[10px] px-3 py-1.5 text-[11px] font-medium transition-colors ${
                active ? "text-copper bg-copper/12" : "text-ink-secondary"
              }`}
            >
              {active ? (
                <span
                  aria-hidden="true"
                  className="absolute top-0 h-0.5 w-7 rounded-full bg-copper"
                />
              ) : null}
              <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
