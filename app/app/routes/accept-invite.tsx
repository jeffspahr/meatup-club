import { Form, redirect } from "react-router";
import type { Route } from "./+types/accept-invite";
import { getUser } from "../lib/auth.server";
import { CheckIcon } from "@heroicons/react/24/outline";
import { Alert } from "../components/ui";
import { getCloudflareContext } from "~/lib/router-context";

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await getUser(request, context);

  if (!user) {
    throw redirect("/login");
  }

  // If user is already active, redirect to dashboard
  if (user.status === "active") {
    throw redirect("/dashboard");
  }

  return { user };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = await getUser(request, context);

  if (!user) {
    throw redirect("/login");
  }

  if (user.status !== "invited") {
    return { error: "Only invited users can accept invitations" };
  }

  const db = getCloudflareContext(context).env.DB;

  // Update user status to active
  await db
    .prepare("UPDATE users SET status = ? WHERE id = ?")
    .bind("active", user.id)
    .run();

  return redirect("/dashboard");
}

export default function AcceptInvitePage({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full card-shell p-8">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-accent mb-2">
            Welcome to Meatup.Club!
          </h1>
          <p className="text-muted-foreground">
            You've been invited to join our exclusive quarterly steakhouse meetup group.
          </p>
        </div>

        <div className="bg-muted border border-border rounded-lg p-6 mb-6">
          <h2 className="font-semibold text-foreground mb-3">
            What you'll get access to:
          </h2>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start">
              <CheckIcon className="w-4 h-4 text-accent mr-2" />
              <span>RSVP to upcoming quarterly meetups</span>
            </li>
            <li className="flex items-start">
              <CheckIcon className="w-4 h-4 text-accent mr-2" />
              <span>Vote on restaurant selections</span>
            </li>
            <li className="flex items-start">
              <CheckIcon className="w-4 h-4 text-accent mr-2" />
              <span>Suggest and vote on meetup dates</span>
            </li>
            <li className="flex items-start">
              <CheckIcon className="w-4 h-4 text-accent mr-2" />
              <span>Connect with fellow steak enthusiasts</span>
            </li>
          </ul>
        </div>

        {actionData?.error && (
          <Alert variant="error" className="mb-4 text-sm">
            {actionData.error}
          </Alert>
        )}

        <Form method="post">
          <button
            type="submit"
            className="w-full btn-primary px-6 py-3"
          >
            Accept Invitation & Join
          </button>
        </Form>

        <p className="text-xs text-muted-foreground text-center mt-4">
          By accepting, you agree to participate in quarterly steakhouse meetups.
        </p>
      </div>
    </div>
  );
}
