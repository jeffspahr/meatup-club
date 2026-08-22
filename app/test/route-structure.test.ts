import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

/**
 * Structural route guards.
 *
 * These tests prove that route modules import, expose a React Router entry point,
 * and remain synchronized with routes.ts. They do not execute requests or prove
 * that a URL avoids a 404; route behavior belongs in route-level tests.
 */
describe("route module structure", () => {
  it("imports every discovered route and finds a route entry-point export", async () => {
    const routeFiles = discoverRouteFiles();
    expect(routeFiles.length).toBeGreaterThan(0);

    for (const file of routeFiles) {
      const route = await import(toImportPath(file));
      const entryPoints = [route.loader, route.action, route.default].filter(Boolean);

      expect(
        entryPoints.length,
        `${file} must export a loader, action, or default component`
      ).toBeGreaterThan(0);
    }
  });

  it("keeps discovered route modules and routes.ts entries in sync", () => {
    const discoveredRoutes = discoverRouteFiles().map(stripExtension);
    const routeConfig = readFileSync(
      join(__dirname, "../app/routes.ts"),
      "utf8"
    );
    const configuredRoutes = Array.from(
      routeConfig.matchAll(/"routes\/([^"]+)\.tsx"/g),
      (match) => match[1]
    );

    const missingFromConfig = discoveredRoutes.filter(
      (file) => !configuredRoutes.includes(file)
    );
    const staleConfigEntries = configuredRoutes.filter(
      (file) => !discoveredRoutes.includes(file)
    );

    expect(
      missingFromConfig,
      `Missing in routes.ts: ${missingFromConfig.join(", ")}`
    ).toEqual([]);
    expect(
      staleConfigEntries,
      `Stale routes.ts entries: ${staleConfigEntries.join(", ")}`
    ).toEqual([]);
  });

  it("gives dashboard modules loaders and API modules request handlers", async () => {
    for (const file of discoverRouteFiles()) {
      if (!file.startsWith("dashboard.") && !file.startsWith("api.")) {
        continue;
      }

      const route = await import(toImportPath(file));

      if (file.startsWith("dashboard.")) {
        expect(
          route.loader,
          `Dashboard route ${file} must export a loader for its access boundary`
        ).toBeTypeOf("function");
      } else {
        expect(
          route.loader || route.action,
          `API route ${file} must export a loader or action`
        ).toBeTypeOf("function");
      }
    }
  });
});

function discoverRouteFiles(): string[] {
  const routesDir = join(__dirname, "../app/routes");
  return readdirSync(routesDir)
    .filter(
      (file) =>
        (file.endsWith(".tsx") || file.endsWith(".ts")) &&
        !file.includes(".test.") &&
        !file.endsWith(".d.ts")
    )
    .sort();
}

function stripExtension(file: string): string {
  return file.replace(/\.tsx?$/, "");
}

function toImportPath(file: string): string {
  return `../app/routes/${stripExtension(file)}`;
}
