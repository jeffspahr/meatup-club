import { useState, useEffect, useRef } from "react";

interface Place {
  id: string;
  displayName: { text: string };
  formattedAddress: string;
}

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

interface RestaurantAutocompleteProps {
  onSelect: (placeDetails: PlaceDetails) => void;
  value: string;
  onChange: (value: string) => void;
}

export function RestaurantAutocomplete({
  onSelect,
  value,
  onChange,
}: RestaurantAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<Place[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const debounceTimer = useRef<NodeJS.Timeout>();
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    if (value.length < 2) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    debounceTimer.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const response = await fetch(
          `/api/places/search?input=${encodeURIComponent(value)}`
        );
        const data = await response.json();
        setSuggestions(data.places || []);
        setShowDropdown(true);
      } catch (error) {
        console.error("Failed to fetch suggestions:", error);
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [value]);

  async function handleSelect(place: Place) {
    setIsLoading(true);
    setShowDropdown(false);

    try {
      const response = await fetch(
        `/api/places/details?placeId=${encodeURIComponent(place.id)}`
      );
      const placeDetails = await response.json();
      onSelect(placeDetails);
      onChange(placeDetails.name);
    } catch (error) {
      console.error("Failed to fetch place details:", error);
    } finally {
      setIsLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!showDropdown || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev < suggestions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === "Enter" && selectedIndex >= 0) {
      e.preventDefault();
      handleSelect(suggestions[selectedIndex]);
    } else if (e.key === "Escape") {
      setShowDropdown(false);
      setSelectedIndex(-1);
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Start typing restaurant name..."
        className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
        autoComplete="off"
      />

      {isLoading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <div className="animate-spin h-4 w-4 border-2 border-amber-600 border-t-transparent rounded-full"></div>
        </div>
      )}

      {showDropdown && suggestions.length > 0 && (
        <div className="absolute z-10 w-full mt-1 bg-card border border-border rounded-md shadow-lg max-h-60 overflow-y-auto">
          {suggestions.map((place, index) => (
            <button
              key={place.id}
              type="button"
              onClick={() => handleSelect(place)}
              className={`w-full text-left px-4 py-3 hover:bg-amber-50 border-b border-border last:border-b-0 transition-colors ${
                index === selectedIndex ? "bg-amber-50" : ""
              }`}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <div className="font-medium text-foreground">
                {place.displayName.text}
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                {place.formattedAddress}
              </div>
            </button>
          ))}
        </div>
      )}

      {showDropdown && !isLoading && suggestions.length === 0 && value.length >= 2 && (
        <div className="absolute z-10 w-full mt-1 bg-card border border-border rounded-md shadow-lg p-4 text-center text-muted-foreground">
          No restaurants found. Try a different search term.
        </div>
      )}
    </div>
  );
}
