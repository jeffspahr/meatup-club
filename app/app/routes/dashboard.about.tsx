import type { Route } from "./+types/dashboard.about";
import { requireActiveUser } from "../lib/auth.server";

interface ContentItem {
  id: number;
  key: string;
  title: string;
  content: string;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireActiveUser(request, context);
  const db = context.cloudflare.env.DB;

  const contentResult = await db
    .prepare('SELECT * FROM site_content ORDER BY id ASC')
    .all();

  return {
    content: contentResult.results || [],
  };
}

export default function AboutPage({ loaderData }: Route.ComponentProps) {
  const { content } = loaderData;

  // Helper function to render content with basic markdown-style formatting
  function renderContent(text: string) {
    return text.split('\n').map((line, index) => {
      // Check if line starts with * (bullet point)
      if (line.trim().startsWith('*')) {
        return (
          <li key={index} className="ml-4">
            {line.trim().substring(1).trim()}
          </li>
        );
      }
      // Regular line
      return line.trim() ? (
        <p key={index} className="mb-2">
          {line}
        </p>
      ) : null;
    });
  }

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-900">About Meatup.Club</h1>
        <p className="text-gray-600 mt-2">
          Everything you need to know about our quarterly steakhouse adventures
        </p>
      </div>

      <div className="space-y-8">
        {content.map((item: any) => (
          <div key={item.id} className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
            <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              {item.key === 'description' && '📖'}
              {item.key === 'goals' && '🎯'}
              {item.key === 'guidelines' && '📋'}
              {item.key === 'membership' && '👥'}
              {item.key === 'safety' && '🚗'}
              {item.title}
            </h2>
            <div className="text-gray-700 leading-relaxed">
              <ul className="space-y-2 list-none">
                {renderContent(item.content)}
              </ul>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 p-6 bg-blue-50 border border-blue-200 rounded-lg">
        <h3 className="font-semibold text-blue-900 mb-2">Questions or Suggestions?</h3>
        <p className="text-sm text-blue-800">
          Have ideas for improving Meatup.Club? Reach out to an admin or submit feedback through the dashboard.
        </p>
      </div>
    </main>
  );
}
