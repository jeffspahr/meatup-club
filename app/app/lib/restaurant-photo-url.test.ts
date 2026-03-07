import { describe, expect, it } from "vitest";
import { normalizeRestaurantPhotoUrl } from "./restaurant-photo-url";

describe("normalizeRestaurantPhotoUrl", () => {
  it("returns nullish and already-proxied photo URLs unchanged", () => {
    expect(normalizeRestaurantPhotoUrl(null)).toBeNull();
    expect(
      normalizeRestaurantPhotoUrl(
        "/api/places/photo?name=places%2Fabc123%2Fphotos%2Fphoto-1&maxHeightPx=400&maxWidthPx=400"
      )
    ).toBe(
      "/api/places/photo?name=places%2Fabc123%2Fphotos%2Fphoto-1&maxHeightPx=400&maxWidthPx=400"
    );
    expect(normalizeRestaurantPhotoUrl("/api/places/photo")).toBe("/api/places/photo");
  });

  it("rewrites legacy Google Places media URLs to the app photo proxy", () => {
    expect(
      normalizeRestaurantPhotoUrl(
        "https://places.googleapis.com/v1/places/abc123/photos/photo-1/media?maxHeightPx=320&maxWidthPx=640&key=test-key"
      )
    ).toBe(
      "/api/places/photo?name=places%2Fabc123%2Fphotos%2Fphoto-1&maxHeightPx=320&maxWidthPx=640"
    );
  });

  it("collapses absolute app photo URLs back to the local proxy path", () => {
    expect(
      normalizeRestaurantPhotoUrl(
        "https://meatup.club/api/places/photo?name=places%2Fabc123%2Fphotos%2Fphoto-1&maxHeightPx=400&maxWidthPx=400",
        "http://localhost:5173/dashboard/polls"
      )
    ).toBe(
      "/api/places/photo?name=places%2Fabc123%2Fphotos%2Fphoto-1&maxHeightPx=400&maxWidthPx=400"
    );
  });

  it("leaves absolute app photo URLs from unrelated origins unchanged", () => {
    expect(
      normalizeRestaurantPhotoUrl(
        "https://preview.meatup-club.pages.dev/api/places/photo?name=places%2Fabc123%2Fphotos%2Fphoto-1&maxHeightPx=400&maxWidthPx=400",
        "http://localhost:5173/dashboard/polls"
      )
    ).toBe(
      "https://preview.meatup-club.pages.dev/api/places/photo?name=places%2Fabc123%2Fphotos%2Fphoto-1&maxHeightPx=400&maxWidthPx=400"
    );
  });

  it("defaults missing dimensions when rewriting Google media URLs", () => {
    expect(
      normalizeRestaurantPhotoUrl(
        "https://places.googleapis.com/v1/places/abc123/photos/photo-1/media"
      )
    ).toBe(
      "/api/places/photo?name=places%2Fabc123%2Fphotos%2Fphoto-1&maxHeightPx=400&maxWidthPx=400"
    );
  });

  it("leaves unrelated external image URLs unchanged", () => {
    expect(
      normalizeRestaurantPhotoUrl(
        "https://images.example.com/prime.jpg",
        "http://localhost:5173/dashboard/polls"
      )
    ).toBe("https://images.example.com/prime.jpg");
  });

  it("leaves unsupported or malformed photo URLs unchanged", () => {
    expect(
      normalizeRestaurantPhotoUrl(
        "https://places.googleapis.com/v1/places/abc123/photos/photo-1",
        "http://localhost:5173/dashboard/polls"
      )
    ).toBe("https://places.googleapis.com/v1/places/abc123/photos/photo-1");
    expect(normalizeRestaurantPhotoUrl("not a url")).toBe("not a url");
  });
});
