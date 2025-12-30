import type { Route } from "./+types/dashboard.preview-minimal";
import { loader as dashboardLoader, DashboardContent } from "./dashboard._index";

export const loader = dashboardLoader;

export default function DashboardPreviewMinimal({
  loaderData,
}: Route.ComponentProps) {
  return <DashboardContent loaderData={loaderData} variant="minimal" />;
}
