import type { Route } from "./+types/dashboard.preview-calm";
import { loader as dashboardLoader, DashboardContent } from "./dashboard._index";

export const loader = dashboardLoader;

export default function DashboardPreviewCalm({
  loaderData,
}: Route.ComponentProps) {
  return <DashboardContent loaderData={loaderData} variant="calm" />;
}
