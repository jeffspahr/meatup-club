import type { Route } from "./+types/dashboard.preview-polished";
import { loader as dashboardLoader, DashboardContent } from "./dashboard._index";

export const loader = dashboardLoader;

export default function DashboardPreviewPolished({
  loaderData,
}: Route.ComponentProps) {
  return <DashboardContent loaderData={loaderData} variant="polished" />;
}
