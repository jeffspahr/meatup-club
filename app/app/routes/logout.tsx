import type { Route } from "./+types/logout";
import { logout, getUser } from "../lib/auth.server";
import { logActivity } from "../lib/activity.server";
import { getCloudflareContext } from "~/lib/router-context";

export async function loader({ request, context }: Route.LoaderArgs) {
  // Log logout activity before destroying session
  const user = await getUser(request, context);
  if (user) {
    const db = getCloudflareContext(context).env.DB;
    await logActivity({
      db,
      userId: user.id,
      actionType: 'logout',
      route: '/logout',
      request,
    });
  }

  return logout(request);
}

export async function action({ request, context }: Route.ActionArgs) {
  // Log logout activity before destroying session
  const user = await getUser(request, context);
  if (user) {
    const db = getCloudflareContext(context).env.DB;
    await logActivity({
      db,
      userId: user.id,
      actionType: 'logout',
      route: '/logout',
      request,
    });
  }

  return logout(request);
}
