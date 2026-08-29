"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { isSupabaseConfigured } from "@/lib/supabase/config";

interface NavItem {
  label: string;
  href?: string; // omit for not-yet-built pages
}
interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  { title: "Home", items: [{ label: "Dashboard", href: "/dashboard" }, { label: "Inbox", href: "/tasks?view=inbox" }] },
  { title: "Plan", items: [{ label: "Tasks", href: "/tasks" }, { label: "Calendar", href: "/calendar" }, { label: "Projects", href: "/projects" }, { label: "Goals", href: "/goals" }] },
  { title: "Track", items: [{ label: "Habits", href: "/habits" }, { label: "Time Tracking" }, { label: "Focus", href: "/focus" }, { label: "Analytics", href: "/analytics" }] },
  { title: "Reflect", items: [{ label: "Journal", href: "/journal" }, { label: "Reviews" }] },
  { title: "Learn", items: [{ label: "Coach", href: "/coach" }, { label: "Methods" }] },
  { title: "System", items: [{ label: "Integrations" }, { label: "Settings", href: "/settings" }] },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    await logout();
    router.push("/login");
  }

  return (
    <div className="app">
      <aside className={`sidebar${mobileOpen ? " open" : ""}`}>
        <div className="brand">
          <span className="logo">F</span> FlowOS
        </div>
        <nav className="nav">
          {NAV.map((group) => (
            <div className="nav-group" key={group.title}>
              <div className="nav-title">{group.title}</div>
              {group.items.map((item) =>
                item.href ? (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={pathname.startsWith(item.href.split("?")[0]) ? "active" : ""}
                    onClick={() => setMobileOpen(false)}
                  >
                    {item.label}
                  </Link>
                ) : (
                  <div className="nav-disabled" key={item.label}>
                    {item.label}
                    <span className="soon">Soon</span>
                  </div>
                )
              )}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="row between">
            <span className="small muted" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
              {user?.full_name || user?.email}
            </span>
            <button className="ghost small" onClick={handleLogout}>Log out</button>
          </div>
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <button className="icon-btn mobile-menu" onClick={() => setMobileOpen((v) => !v)} aria-label="Toggle menu">
            ☰
          </button>
          <div />
          <div className="top-actions">
            <Link href="/coach" className="icon-btn" title="Ask the Productivity Coach">🧭</Link>
            <button className="icon-btn kbd" onClick={() => window.dispatchEvent(new CustomEvent("flowos:open-command-palette"))} title="Search & quick actions (⌘K)">
              ⌘K
            </button>
            {isSupabaseConfigured() ? (
              <span className="tag" title="Your data syncs to your account, protected by Supabase Row Level Security">Cloud sync</span>
            ) : (
              <span className="tag" title="No data leaves this browser">Local-only mode</span>
            )}
          </div>
        </div>
        <div className="content">{children}</div>
      </div>
      <CommandPalette />
    </div>
  );
}
