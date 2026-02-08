import type { Route } from "./+types/pending";
import { getUser } from "../lib/auth.server";
import { ClockIcon } from "@heroicons/react/24/outline";

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await getUser(request, context);
  return { user };
}

export default function Pending({ loaderData }: Route.ComponentProps) {
  const { user } = loaderData;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-md w-full card-shell p-8">
        <div className="text-center">
          <div className="mb-4 flex justify-center">
            <div className="icon-container-lg">
              <ClockIcon className="w-6 h-6" />
            </div>
          </div>
          <h1 className="text-display-md mb-4">
            Account Pending
          </h1>
          <p className="text-muted-foreground mb-6">
            Thanks for signing in{user?.name ? `, ${user.name}` : ""}! Your account is
            currently pending approval.
          </p>
          <p className="text-muted-foreground mb-8">
            An admin will review your request and activate your account soon.
            You'll receive an email once you're approved.
          </p>
          <form method="post" action="/logout">
            <button
              type="submit"
              className="btn-secondary"
            >
              Sign Out
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
