import type { Route } from "./+types/pending";
import { getUser } from "../lib/auth.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await getUser(request, context);
  return { user };
}

export default function Pending({ loaderData }: Route.ComponentProps) {
  const { user } = loaderData;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Account Pending
          </h1>
          <p className="text-gray-600 mb-6">
            Thanks for signing in{user?.name ? `, ${user.name}` : ""}! Your account is
            currently pending approval.
          </p>
          <p className="text-gray-600 mb-8">
            An admin will review your request and activate your account soon.
            You'll receive an email once you're approved.
          </p>
          <form method="post" action="/logout">
            <button
              type="submit"
              className="bg-gray-600 text-white px-6 py-2 rounded-lg hover:bg-gray-700 transition"
            >
              Sign Out
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
