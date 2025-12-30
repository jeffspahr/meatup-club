import type { Route } from "./+types/dashboard.preview-product";
import { loader as dashboardLoader, DashboardContent } from "./dashboard._index";

export const loader = dashboardLoader;

export default function DashboardPreviewProduct({
  loaderData,
}: Route.ComponentProps) {
  return <DashboardContent loaderData={loaderData} variant="product" />;
}
