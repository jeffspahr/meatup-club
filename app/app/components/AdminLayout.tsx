import { Link, useLocation } from "react-router";
import {
  HomeIcon,
  CalendarDaysIcon,
  ClipboardDocumentCheckIcon,
  UserGroupIcon,
  DocumentTextIcon,
  EnvelopeIcon,
  ChartBarIcon,
  ArrowLeftIcon,
} from "@heroicons/react/24/outline";
import type { ReactNode } from "react";

interface AdminLayoutProps {
  children: ReactNode;
}

const sidebarLinks = [
  { to: "/dashboard/admin", label: "Dashboard", icon: HomeIcon, exact: true },
  { to: "/dashboard/admin/events", label: "Events", icon: CalendarDaysIcon },
  { to: "/dashboard/admin/polls", label: "Polls", icon: ClipboardDocumentCheckIcon },
  { to: "/dashboard/admin/members", label: "Members", icon: UserGroupIcon },
  { to: "/dashboard/admin/content", label: "Content", icon: DocumentTextIcon },
  { to: "/dashboard/admin/email-templates", label: "Email Templates", icon: EnvelopeIcon },
  { to: "/dashboard/admin/analytics", label: "Analytics", icon: ChartBarIcon },
];

export function AdminLayout({ children }: AdminLayoutProps) {
  const location = useLocation();
  const pathname = location.pathname;

  const isActive = (path: string, exact?: boolean) =>
    exact ? pathname === path : pathname.startsWith(path);

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <div className="px-4 mb-4">
          <Link
            to="/dashboard"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            Back to Dashboard
          </Link>
        </div>

        <nav className="flex flex-col gap-0.5">
          {sidebarLinks.map((link) => {
            const active = isActive(link.to, link.exact);
            const Icon = link.icon;
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`admin-sidebar-link ${active ? "admin-sidebar-link-active" : ""}`}
              >
                <Icon className="w-4 h-4" />
                {link.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="admin-content">
        {children}
      </div>
    </div>
  );
}
