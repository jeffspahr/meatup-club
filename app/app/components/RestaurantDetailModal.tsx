import { ClockIcon, MapPinIcon } from "@heroicons/react/24/outline";
import { Button } from "./ui";

export interface RestaurantDetail {
  id: number;
  created_by: number;
  name: string;
  address: string | null;
  photo_url: string | null;
  google_maps_url: string | null;
  opening_hours: string | null;
  suggested_by_name: string | null;
}

interface RestaurantDetailModalProps {
  restaurant: RestaurantDetail | null;
  canDelete: boolean;
  onClose: () => void;
  onDelete: (restaurant: RestaurantDetail) => void;
}

function parseHours(raw: string | null): Array<{ day: string; hours: string }> | null {
  if (!raw) return null;
  try {
    const items = JSON.parse(raw);
    if (!Array.isArray(items)) return null;
    return items
      .map((entry: unknown) => {
        if (typeof entry !== "string") return null;
        const idx = entry.indexOf(":");
        if (idx === -1) return null;
        return {
          day: entry.slice(0, idx).trim(),
          hours: entry.slice(idx + 1).trim(),
        };
      })
      .filter((h): h is { day: string; hours: string } => h !== null);
  } catch {
    return null;
  }
}

export function RestaurantDetailModal({
  restaurant,
  canDelete,
  onClose,
  onDelete,
}: RestaurantDetailModalProps) {
  if (!restaurant) return null;

  const hours = parseHours(restaurant.opening_hours);

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {restaurant.photo_url && (
          <div className="w-full h-48 overflow-hidden rounded-t-lg">
            <img
              src={restaurant.photo_url}
              alt={restaurant.name}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).parentElement!.style.display = "none";
              }}
            />
          </div>
        )}

        <div className="p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <h3 className="text-xl font-semibold text-foreground">{restaurant.name}</h3>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground text-2xl leading-none"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <div className="space-y-4">
            {restaurant.address && (
              <div className="flex items-start gap-2 text-sm text-foreground">
                <MapPinIcon className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                <span>{restaurant.address}</span>
              </div>
            )}

            {hours && hours.length > 0 && (
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
                  <ClockIcon className="w-4 h-4 text-muted-foreground" />
                  <span>Hours</span>
                </div>
                <div className="space-y-1 text-sm pl-6">
                  {hours.map((h, idx) => (
                    <div key={idx} className="flex justify-between gap-3">
                      <span className="font-medium text-foreground">{h.day}</span>
                      <span className="text-muted-foreground">{h.hours}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {restaurant.google_maps_url && (
              <div>
                <a
                  href={restaurant.google_maps_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-accent hover:text-accent-strong hover:underline"
                >
                  View on Google Maps →
                </a>
              </div>
            )}

            {restaurant.suggested_by_name && (
              <p className="text-sm text-muted-foreground">
                Suggested by {restaurant.suggested_by_name}
              </p>
            )}
          </div>

          {canDelete && (
            <div className="mt-6 pt-4 border-t border-border/30 flex justify-end">
              <Button
                variant="danger"
                size="sm"
                onClick={() => onDelete(restaurant)}
              >
                Delete
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
