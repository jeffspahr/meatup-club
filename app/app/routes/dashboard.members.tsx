import type { Route } from "./+types/dashboard.members";
import type { Member } from "~/lib/types";
import { formatDateForDisplay } from "../lib/dateUtils";
import { requireActiveUser } from "../lib/auth.server";
import { PageHeader, Card, UserAvatar, Badge } from "~/components/ui";

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
      <PageHeader
        title="Members"
        description={`Active Meatup.Club members (${members.length})`}
      />

      {/* Members Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {members.map((member: Member) => (
          <Card
            key={member.id}
            hover
          >
            <div className="flex items-center gap-4">
              <UserAvatar
                src={member.picture}
                name={member.name}
                email={member.email}
                size="lg"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-foreground">
                    {member.name || 'No name'}
                  </h3>
                  {member.is_admin ? (
                    <Badge variant="accent">Admin</Badge>
                  ) : null}
                </div>
                <p className="text-sm text-muted-foreground">{member.email}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Joined {formatDateForDisplay(member.created_at)}
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </main>
  );
}
