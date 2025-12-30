import { Outlet } from "react-router";
import type { Route } from "./+types/dashboard";
import { requireActiveUser } from "../lib/auth.server";
import DashboardNav from "../components/DashboardNav";

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireActiveUser(request, context);
  return { user };
}

export default function DashboardLayout({ loaderData }: Route.ComponentProps) {
  const { user } = loaderData;
  const isAdmin = user.is_admin === 1;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(206,230,236,0.6),_transparent_55%),radial-gradient(circle_at_bottom,_rgba(222,238,241,0.8),_transparent_55%)] dark:bg-[radial-gradient(circle_at_top,_rgba(34,78,90,0.45),_transparent_55%),radial-gradient(circle_at_bottom,_rgba(8,12,14,0.95),_transparent_60%)]" />
      <DashboardNav isAdmin={isAdmin} />
      <Outlet />
    </div>
  );
}
