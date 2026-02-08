import { useState, useEffect } from "react";
import { isDateInPastLocal, getTodayDateStringLocal } from "../lib/dateUtils";
import { CheckIcon } from "@heroicons/react/24/outline";

interface DateVote {
  date_suggestion_id: number;
  user_id: number;
  suggested_date: string;
  user_name: string | null;
  user_email: string;
}

interface DateSuggestion {
  id: number;
  suggested_date: string;
  vote_count: number;
}

interface DoodleViewProps {
  dateSuggestions: DateSuggestion[];
  dateVotes: DateVote[];
  currentUserId: number;
}

export function DoodleView({ dateSuggestions, dateVotes, currentUserId }: DoodleViewProps) {
  // Only render on client-side to use local timezone consistently
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Don't render anything during SSR
  if (!isMounted) {
    return null;
  }

  // Filter dates based on user's local timezone (client-side only)
  const filteredDateSuggestions = dateSuggestions.filter(ds => {
    return !isDateInPastLocal(ds.suggested_date);
  });

  const filteredDateVotes = dateVotes.filter(dv =>
    !isDateInPastLocal(dv.suggested_date)
  );

  // Get unique users who have voted (from filtered votes)
  const uniqueUsers = Array.from(
    new Map(
      filteredDateVotes.map(vote => [
        vote.user_id,
        { id: vote.user_id, name: vote.user_name || vote.user_email }
      ])
    ).values()
  );

  // Create a map of user_id -> date -> hasVoted (from filtered votes)
  const voteMap = new Map<number, Set<string>>();
  filteredDateVotes.forEach(vote => {
    if (!voteMap.has(vote.user_id)) {
      voteMap.set(vote.user_id, new Set());
    }
    voteMap.get(vote.user_id)!.add(vote.suggested_date);
  });

  // Recalculate vote counts based on filtered votes (not database count)
  const dateVoteCounts = new Map<string, number>();
  filteredDateVotes.forEach(vote => {
    const count = dateVoteCounts.get(vote.suggested_date) || 0;
    dateVoteCounts.set(vote.suggested_date, count + 1);
  });

  // Only show dates that have at least one vote (after filtering)
  const votedDates = filteredDateSuggestions.filter(ds => {
    const voteCount = dateVoteCounts.get(ds.suggested_date) || 0;
    return voteCount > 0;
  });

  if (votedDates.length === 0 || uniqueUsers.length === 0) {
    return null;
  }

  return (
    <div className="mt-6">
      <h4 className="text-sm font-semibold text-foreground mb-3">Availability Grid</h4>
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead>
            <tr>
              <th className="border border-border bg-muted px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                Name
              </th>
              {votedDates.map(date => {
                // Parse date as local (not UTC) to avoid timezone shifts
                const [year, month, day] = date.suggested_date.split('-').map(Number);
                const localDate = new Date(year, month - 1, day);

                return (
                  <th
                    key={date.id}
                    className="border border-border bg-muted px-2 py-2 text-center text-xs font-medium text-muted-foreground min-w-[80px]"
                  >
                    <div className="flex flex-col">
                      <span className="font-semibold">
                        {localDate.toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric'
                        })}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {localDate.toLocaleDateString('en-US', {
                          weekday: 'short'
                        })}
                      </span>
                    </div>
                  </th>
                );
              })}
              <th className="border border-border bg-muted px-3 py-2 text-center text-xs font-medium text-muted-foreground">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {uniqueUsers.map(user => {
              const userVotes = voteMap.get(user.id) || new Set();
              const voteCount = votedDates.filter(d => userVotes.has(d.suggested_date)).length;

              return (
                <tr key={user.id} className={user.id === currentUserId ? 'bg-blue-50 dark:bg-blue-900/30' : ''}>
                  <td className="border border-border px-3 py-2 text-xs font-medium text-foreground">
                    {user.name}
                    {user.id === currentUserId && (
                      <span className="ml-1 text-[10px] text-blue-600 dark:text-blue-400">(you)</span>
                    )}
                  </td>
                  {votedDates.map(date => (
                    <td
                      key={date.id}
                      className={`border border-border text-center ${
                        userVotes.has(date.suggested_date)
                          ? 'bg-green-100 dark:bg-green-900/30'
                          : ''
                      }`}
                    >
                      {userVotes.has(date.suggested_date) && (
                        <CheckIcon className="w-5 h-5 text-green-600 dark:text-green-400" />
                      )}
                    </td>
                  ))}
                  <td className="border border-border px-3 py-2 text-center text-xs font-semibold text-foreground">
                    {voteCount}
                  </td>
                </tr>
              );
            })}
            <tr className="bg-muted">
              <td className="border border-border px-3 py-2 text-xs font-semibold text-foreground">
                Total Votes
              </td>
              {votedDates.map(date => (
                <td
                  key={date.id}
                  className="border border-border px-3 py-2 text-center text-xs font-semibold text-foreground"
                >
                  {dateVoteCounts.get(date.suggested_date) || 0}
                </td>
              ))}
              <td className="border border-border"></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
