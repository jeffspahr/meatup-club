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
    <div className="min-h-screen bg-background text-foreground relative">
      {/* Ambient background effects */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        {/* Top amber glow */}
        <div className="absolute top-0 left-1/4 w-[800px] h-[400px] bg-accent/[0.04] blur-[120px] rounded-full" />
        {/* Bottom burgundy glow */}
        <div className="absolute bottom-0 right-1/4 w-[600px] h-[300px] bg-burgundy/[0.03] blur-[100px] rounded-full" />
        {/* Noise texture overlay */}
        <div
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          }}
        />
      </div>

      <DashboardNav isAdmin={isAdmin} />
      <Outlet />
    </div>
  );
}
