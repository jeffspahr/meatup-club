import { useState } from "react";
import { RestaurantAutocomplete } from "./RestaurantAutocomplete";
import { CheckIcon } from "@heroicons/react/24/outline";
import { StarIcon } from "@heroicons/react/24/solid";

interface PlaceDetails {
  placeId: string;
  name: string;
  address: string;
  phone: string;
  website: string;
  googleMapsUrl: string;
  rating: number;
  ratingCount: number;
  priceLevel: number;
  photoUrl: string;
  cuisine: string;
  openingHours?: string;
}

interface AddRestaurantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (placeDetails: PlaceDetails) => void;
  title?: string;
}

export function AddRestaurantModal({
  isOpen,
  onClose,
  onSubmit,
  title = "Add a Restaurant",
}: AddRestaurantModalProps) {
  const [restaurantName, setRestaurantName] = useState("");
  const [placeDetails, setPlaceDetails] = useState<PlaceDetails | null>(null);

  function handleClose() {
    setRestaurantName("");
    setPlaceDetails(null);
    onClose();
  }

  function handleSelect(details: PlaceDetails) {
    setPlaceDetails(details);
    setRestaurantName(details.name);
  }

  function handleSubmit() {
    if (placeDetails) {
      onSubmit(placeDetails);
      handleClose();
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold text-foreground">
            {title}
          </h3>
          <button
            onClick={handleClose}
            className="text-muted-foreground hover:text-foreground text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Search for Restaurant
            </label>
            <RestaurantAutocomplete
              value={restaurantName}
              onChange={setRestaurantName}
              onSelect={handleSelect}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Start typing to search Google Places
            </p>
          </div>

          {placeDetails && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <h4 className="font-semibold text-green-900 dark:text-green-100 mb-2 flex items-center gap-2">
                <CheckIcon className="w-4 h-4" />
                <span>Restaurant Found</span>
              </h4>
              <div className="space-y-2">
                <div className="flex items-start gap-3">
                  {placeDetails.photoUrl && (
                    <img
                      src={placeDetails.photoUrl}
                      alt={placeDetails.name}
                      className="w-20 h-20 object-cover rounded flex-shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground">
                      {placeDetails.name}
                    </p>
                    {placeDetails.address && (
                      <p className="text-sm text-foreground">
                        {placeDetails.address}
                      </p>
                    )}
                    {placeDetails.cuisine && (
                      <p className="text-sm text-muted-foreground">
                        Cuisine: {placeDetails.cuisine}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-1">
                      {placeDetails.rating > 0 && (
                        <span className="text-sm text-foreground">
                          <StarIcon className="w-4 h-4 text-amber-500 inline" /> {placeDetails.rating} ({placeDetails.ratingCount}{" "}
                          reviews)
                        </span>
                      )}
                      {placeDetails.priceLevel > 0 && (
                        <span className="text-sm text-foreground">
                          {"$".repeat(placeDetails.priceLevel)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-4">
            <button
              onClick={handleSubmit}
              disabled={!placeDetails}
              className="flex-1 px-6 py-2 bg-amber-600 text-white rounded-md font-medium hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add Restaurant
            </button>
            <button
              onClick={handleClose}
              className="px-6 py-2 bg-muted text-foreground rounded-md font-medium hover:bg-muted/80 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
