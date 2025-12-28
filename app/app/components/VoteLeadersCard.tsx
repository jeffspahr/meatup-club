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

  const bgColor = variant === 'blue' ? 'bg-blue-50' : 'bg-amber-50';
  const borderColor = variant === 'blue' ? 'border-blue-200' : 'border-amber-200';
  const textColor = variant === 'blue' ? 'text-blue-900' : 'text-amber-900';
  const badgeBg = variant === 'blue' ? 'bg-blue-100' : 'bg-blue-200';
  const badgeText = variant === 'blue' ? 'text-blue-800' : 'text-blue-900';
  const restaurantBadgeBg = variant === 'blue' ? 'bg-blue-100' : 'bg-amber-200';
  const restaurantBadgeText = variant === 'blue' ? 'text-blue-800' : 'text-amber-900';
  const restaurantLabelColor = variant === 'blue' ? 'text-gray-600' : 'text-amber-900';
  const restaurantTextColor = variant === 'blue' ? 'text-gray-900' : 'text-amber-900';
  const restaurantAddressColor = variant === 'blue' ? 'text-gray-600' : 'text-amber-800';

  return (
    <div className={`${bgColor} border ${borderColor} rounded-lg p-6 mb-8`}>
      <h2 className={`text-lg font-semibold ${textColor} mb-4`}>
        {variant === 'blue' ? 'Current Vote Leaders' : 'Leading Restaurant'}
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Restaurant Leader */}
        {topRestaurant ? (
          <div className={variant === 'blue' ? 'bg-white rounded-lg p-4' : ''}>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-sm font-medium ${restaurantLabelColor}`}>
                {variant === 'blue' ? 'Restaurant' : ''}
              </span>
              <span className={`px-2 py-1 ${restaurantBadgeBg} ${restaurantBadgeText} text-xs font-${variant === 'blue' ? 'semibold' : 'bold'} rounded`}>
                {topRestaurant.vote_count} votes
              </span>
            </div>
            <p className={`font-${variant === 'blue' ? 'semibold' : 'bold'} ${restaurantTextColor} ${variant === 'blue' ? '' : 'text-lg'}`}>
              {topRestaurant.name}
            </p>
            {topRestaurant.address && (
              <p className={`text-sm ${restaurantAddressColor} mt-1`}>
                {topRestaurant.address}
              </p>
            )}
          </div>
        ) : (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <p className="text-gray-600 text-center">No restaurant suggestions yet</p>
          </div>
        )}

        {/* Date Leader */}
        {topDate ? (
          <div className={variant === 'blue' ? 'bg-white rounded-lg p-4' : `${bgColor} border ${borderColor} rounded-lg p-4`}>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-sm font-medium ${variant === 'blue' ? 'text-gray-600' : textColor}`}>
                {variant === 'blue' ? 'Date' : 'Leading Date'}
              </span>
              <span className={`px-2 py-1 ${badgeBg} ${badgeText} text-xs font-${variant === 'blue' ? 'semibold' : 'bold'} rounded`}>
                {topDate.vote_count} votes
              </span>
            </div>
            <p className={`font-${variant === 'blue' ? 'semibold' : 'bold'} ${variant === 'blue' ? 'text-gray-900' : textColor} ${variant === 'blue' ? '' : 'text-lg'}`}>
              {formatDateForDisplay(topDate.suggested_date)}
            </p>
          </div>
        ) : (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <p className="text-gray-600 text-center">No date suggestions yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
