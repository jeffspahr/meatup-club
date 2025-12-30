import type { Route } from "./+types/dashboard.preview-editorial";
import { loader as dashboardLoader, DashboardContent } from "./dashboard._index";

export const loader = dashboardLoader;

export default function DashboardPreviewEditorial({
  loaderData,
}: Route.ComponentProps) {
  return <DashboardContent loaderData={loaderData} variant="editorial" />;
}
