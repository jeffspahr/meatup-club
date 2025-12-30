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
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(213,227,255,0.5),_transparent_55%),radial-gradient(circle_at_bottom,_rgba(230,236,246,0.7),_transparent_55%)] dark:bg-[radial-gradient(circle_at_top,_rgba(45,60,86,0.35),_transparent_55%),radial-gradient(circle_at_bottom,_rgba(8,10,14,0.95),_transparent_60%)]" />
      <DashboardNav isAdmin={isAdmin} />
      <Outlet />
    </div>
  );
}
