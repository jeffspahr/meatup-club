import type { Route } from "./+types/dashboard.members";
import { formatDateForDisplay } from "../lib/dateUtils";
import { requireActiveUser } from "../lib/auth.server";

interface Member {
  id: number;
  email: string;
  name: string | null;
  picture: string | null;
  is_admin: number;
  status: string;
  created_at: string;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireActiveUser(request, context);
  const db = context.cloudflare.env.DB;

  const membersResult = await db
    .prepare('SELECT * FROM users WHERE status = ? ORDER BY created_at ASC')
    .bind('active')
    .all();

  const members = membersResult.results || [];

  return { members };
}

export default function MembersPage({ loaderData }: Route.ComponentProps) {
  const { members } = loaderData;

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Members</h1>
        <p className="text-muted-foreground mt-1">
          Active Meatup.Club members ({members.length})
        </p>
      </div>

      {/* Members Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {members.map((member: any) => (
          <div
            key={member.id}
            className="bg-card border border-border rounded-lg p-6 hover:shadow-md transition"
          >
            <div className="flex items-center gap-4">
              {member.picture ? (
                <img
                  src={member.picture}
                  alt={member.name || ''}
                  className="w-16 h-16 rounded-full"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-gray-300 flex items-center justify-center text-gray-600 font-bold text-xl">
                  {(member.name || member.email)[0].toUpperCase()}
                </div>
              )}
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-foreground">
                    {member.name || 'No name'}
                  </h3>
                  {member.is_admin ? (
                    <span className="px-2 py-1 text-xs font-semibold rounded-full bg-meat-red text-white">
                      Admin
                    </span>
                  ) : null}
                </div>
                <p className="text-sm text-muted-foreground">{member.email}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Joined {formatDateForDisplay(member.created_at)}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
