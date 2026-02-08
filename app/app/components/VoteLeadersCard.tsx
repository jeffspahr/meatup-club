import { formatDateForDisplay } from '../lib/dateUtils';

interface VoteWinner {
  name: string;
  address: string | null;
  vote_count: number;
}

interface DateWinner {
  suggested_date: string;
  vote_count: number;
}

interface VoteLeadersCardProps {
  topRestaurant: VoteWinner | null;
  topDate: DateWinner | null;
  variant?: 'blue' | 'amber';
}

/**
 * Displays the current vote leaders for restaurant and date
 *
 * IMPORTANT: Uses formatDateForDisplay to avoid timezone bugs
 * Do NOT use the Date constructor with toLocaleDateString() as it parses UTC
 * and can shift dates by 1 day in timezones west of UTC
 */
export default function VoteLeadersCard({
  topRestaurant,
  topDate,
  variant = 'blue'
}: VoteLeadersCardProps) {
  if (!topRestaurant && !topDate) {
    return null;
  }

  return (
    <div className="card-shell p-6 mb-8 border-accent/20">
      <h2 className="text-lg font-semibold text-foreground mb-4">
        {variant === 'blue' ? 'Current Vote Leaders' : 'Leading Restaurant'}
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Restaurant Leader */}
        {topRestaurant ? (
          <div className="bg-muted/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-muted-foreground">
                {variant === 'blue' ? 'Restaurant' : ''}
              </span>
              <span className="badge badge-accent">
                {topRestaurant.vote_count} votes
              </span>
            </div>
            <p className="font-semibold text-foreground">
              {topRestaurant.name}
            </p>
            {topRestaurant.address && (
              <p className="text-sm text-muted-foreground mt-1">
                {topRestaurant.address}
              </p>
            )}
          </div>
        ) : (
          <div className="bg-muted border border-border rounded-lg p-4">
            <p className="text-muted-foreground text-center">No restaurant suggestions yet</p>
          </div>
        )}

        {/* Date Leader */}
        {topDate ? (
          <div className="bg-muted/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-muted-foreground">
                {variant === 'blue' ? 'Date' : 'Leading Date'}
              </span>
              <span className="badge badge-accent">
                {topDate.vote_count} votes
              </span>
            </div>
            <p className="font-semibold text-foreground">
              {formatDateForDisplay(topDate.suggested_date)}
            </p>
          </div>
        ) : (
          <div className="bg-muted border border-border rounded-lg p-4">
            <p className="text-muted-foreground text-center">No date suggestions yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
