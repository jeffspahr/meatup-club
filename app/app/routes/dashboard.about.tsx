import type { Route } from "./+types/dashboard.about";
import type { ContentItem } from "~/lib/types";
import { requireActiveUser } from "../lib/auth.server";
import ReactMarkdown from 'react-markdown';
import { PageHeader, Card, Alert } from "~/components/ui";
import {
  BookOpenIcon,
  RocketLaunchIcon,
  ClipboardDocumentListIcon,
  UserGroupIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireActiveUser(request, context);
  const db = context.cloudflare.env.DB;

  const contentResult = await db
    .prepare('SELECT * FROM site_content ORDER BY id ASC')
    .all();

  return {
    content: (contentResult.results || []) as unknown as ContentItem[],
  };
}

export default function AboutPage({ loaderData }: Route.ComponentProps) {
  const { content } = loaderData;

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <PageHeader
        title="About Meatup.Club"
        description="Everything you need to know about our quarterly steakhouse adventures"
      />

      <div className="space-y-8">
        {content.map((item: ContentItem) => (
          <Card key={item.id}>
            <h2 className="text-2xl font-bold text-foreground mb-4 flex items-center gap-2">
              <span className="w-6 h-6 text-accent">
                {item.key === 'description' && <BookOpenIcon className="w-6 h-6" />}
                {item.key === 'goals' && <RocketLaunchIcon className="w-6 h-6" />}
                {item.key === 'guidelines' && <ClipboardDocumentListIcon className="w-6 h-6" />}
                {item.key === 'membership' && <UserGroupIcon className="w-6 h-6" />}
                {item.key === 'safety' && <ShieldCheckIcon className="w-6 h-6" />}
              </span>
              {item.title}
            </h2>
            <div className="prose prose-gray max-w-none text-muted-foreground leading-relaxed">
              <ReactMarkdown
                components={{
                  ul: ({ children }) => <ul className="space-y-2 list-disc ml-6">{children}</ul>,
                  ol: ({ children }) => <ol className="space-y-2 list-decimal ml-6">{children}</ol>,
                  li: ({ children }) => <li className="text-muted-foreground">{children}</li>,
                  p: ({ children }) => <p className="mb-3">{children}</p>,
                  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                  em: ({ children }) => <em className="italic">{children}</em>,
                  h1: ({ children }) => <h1 className="text-2xl font-bold mb-3 text-foreground">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-xl font-bold mb-2 text-foreground">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-lg font-semibold mb-2 text-foreground">{children}</h3>,
                }}
              >
                {item.content}
              </ReactMarkdown>
            </div>
          </Card>
        ))}
      </div>

      <Alert variant="info" className="mt-8">
        <h3 className="font-semibold mb-2">Questions or Suggestions?</h3>
        <p className="text-sm">
          Have ideas for improving Meatup.Club? Reach out to an admin or submit feedback through the dashboard.
        </p>
      </Alert>
    </main>
  );
}
