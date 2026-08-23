import { useEffect, useId, useState } from "react";
import { MapPinIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { RestaurantAutocomplete } from "./RestaurantAutocomplete";

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
}

interface EventRestaurantFieldsProps {
  restaurantName: string;
  restaurantAddress: string;
  onRestaurantNameChange: (value: string) => void;
  onRestaurantAddressChange: (value: string) => void;
}

export function EventRestaurantFields({
  restaurantName,
  restaurantAddress,
  onRestaurantNameChange,
  onRestaurantAddressChange,
}: EventRestaurantFieldsProps) {
  const searchId = useId();
  const addressId = useId();
  const [searchValue, setSearchValue] = useState(restaurantName);

  useEffect(() => {
    setSearchValue(restaurantName);
  }, [restaurantName]);

  function handleSelect(place: PlaceDetails) {
    setSearchValue(place.name);
    onRestaurantNameChange(place.name);
    onRestaurantAddressChange(place.address || "");
  }

  function handleSearchChange(value: string) {
    setSearchValue(value);

    if (value !== restaurantName) {
      onRestaurantNameChange("");
      onRestaurantAddressChange("");
    }
  }

  function clearSelection() {
    setSearchValue("");
    onRestaurantNameChange("");
    onRestaurantAddressChange("");
  }

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={searchId} className="block text-sm font-medium text-foreground mb-1">
          Restaurant *
        </label>
        <RestaurantAutocomplete
          inputId={searchId}
          value={searchValue}
          onChange={handleSearchChange}
          onSelect={handleSelect}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Search Google Places and pick a result to attach the restaurant to this event.
        </p>
      </div>

      <input type="hidden" name="restaurant_name" value={restaurantName} />

      {restaurantName ? (
        <div className="rounded-lg border border-border bg-muted/40 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">{restaurantName}</p>
              {restaurantAddress ? (
                <p className="mt-1 text-sm text-muted-foreground flex items-start gap-1.5">
                  <MapPinIcon className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{restaurantAddress}</span>
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={clearSelection}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
            >
              <XMarkIcon className="h-4 w-4" />
              Clear
            </button>
          </div>

          <div className="mt-3">
            <label htmlFor={addressId} className="block text-sm font-medium text-foreground mb-1">
              Address
            </label>
            <input
              id={addressId}
              name="restaurant_address"
              type="text"
              value={restaurantAddress}
              onChange={(event) => onRestaurantAddressChange(event.target.value)}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-foreground focus:outline-hidden focus:ring-2 focus:ring-accent"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
