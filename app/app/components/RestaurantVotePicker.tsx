import { Button, EmptyState } from "./ui";

interface RestaurantVoteOption {
  id: number;
  name: string;
  vote_count: number;
  user_has_voted: number;
}

interface RestaurantVotePickerProps {
  suggestions: RestaurantVoteOption[];
  isSubmitting?: boolean;
}

export function RestaurantVotePicker({
  suggestions,
  isSubmitting = false,
}: RestaurantVotePickerProps) {
  const sorted = [...suggestions].sort((a, b) => a.name.localeCompare(b.name));
  const currentVote = sorted.find((s) => s.user_has_voted > 0) ?? null;
  const currentVoteId = currentVote ? String(currentVote.id) : '';

  if (sorted.length === 0) {
    return (
      <EmptyState
        title="No restaurants yet"
        description="Add a restaurant from the dashboard to start voting."
      />
    );
  }

  return (
    <div className="space-y-3">
      <label htmlFor="restaurant-vote" className="block text-sm font-medium text-foreground">
        Your vote
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <select
          id="restaurant-vote"
          name="suggestion_id"
          defaultValue={currentVoteId}
          className="flex-1 min-w-[16rem] rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="">— No vote —</option>
          {sorted.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.vote_count} {s.vote_count === 1 ? 'vote' : 'votes'})
            </option>
          ))}
        </select>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving Vote…' : 'Save Vote'}
        </Button>
      </div>
      {currentVote && (
        <p className="text-sm text-muted-foreground">
          Current vote: <span className="font-medium text-foreground">{currentVote.name}</span>
        </p>
      )}
    </div>
  );
}
