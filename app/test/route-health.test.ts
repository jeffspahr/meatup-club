import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readdirSync } from 'fs';
import { join } from 'path';

/**
 * Route Health Tests
 *
 * Ensures all routes are properly configured and don't return 404 errors.
 * This catches common issues like:
 * - Missing route exports (loader/action)
 * - Incorrect file naming
 * - Route configuration errors
 *
 * AUTOMATIC ROUTE DISCOVERY:
 * This test automatically discovers all route files in app/routes/
 * and validates them based on naming conventions. New routes are
 * automatically tested - no manual updates needed!
 */

describe('Route Health - All Routes Should Load Without 404', () => {
  let mockContext: any;
  let mockRequest: Request;

  beforeEach(() => {
    // Mock Cloudflare context
    mockContext = {
      cloudflare: {
        env: {
          DB: createMockDB(),
          RESEND_API_KEY: 'test-api-key',
          GOOGLE_PLACES_API_KEY: 'test-places-key',
          RESEND_WEBHOOK_SECRET: 'test-webhook-secret',
        },
        ctx: {
          waitUntil: vi.fn(),
        },
      },
    };

    // Mock request
    mockRequest = new Request('http://localhost:3000/');
  });

  describe('Public Routes', () => {
    it('/ should load (landing page)', async () => {
      const { loader } = await import('../app/routes/_index');

      if (loader) {
        const result = await loader({ request: mockRequest, context: mockContext, params: {} });
        expect(result).toBeDefined();
      }
      // If no loader, the route still exists and should work
      expect(true).toBe(true);
    });

    it('/login should have loader (redirect-only route)', async () => {
      const { loader } = await import('../app/routes/login');
      expect(loader).toBeDefined();
      expect(typeof loader).toBe('function');
      // This is a loader-only route that redirects to Google OAuth
    });
  });

  describe('Auth Routes', () => {
    it('/auth/google/callback should have loader (processes OAuth)', async () => {
      const { loader } = await import('../app/routes/auth.google.callback');
      expect(loader).toBeDefined();
      expect(typeof loader).toBe('function');
      // This is a loader-only route that processes OAuth callback
    });

    it('/logout should have action', async () => {
      const { action } = await import('../app/routes/logout');
      expect(action).toBeDefined();
    });
  });

  describe('Dashboard Routes (Authenticated)', () => {
    const dashboardRoutes = [
      { path: '/dashboard', file: '../app/routes/dashboard' },
      { path: '/dashboard/_index', file: '../app/routes/dashboard._index' },
      { path: '/dashboard/about', file: '../app/routes/dashboard.about' },
      { path: '/dashboard/events', file: '../app/routes/dashboard.events' },
      { path: '/dashboard/members', file: '../app/routes/dashboard.members' },
      { path: '/dashboard/polls', file: '../app/routes/dashboard.polls' },
      { path: '/dashboard/profile', file: '../app/routes/dashboard.profile' },
      { path: '/dashboard/restaurants', file: '../app/routes/dashboard.restaurants' },
      { path: '/dashboard/rsvp', file: '../app/routes/dashboard.rsvp' },
    ];

    dashboardRoutes.forEach(({ path, file }) => {
      it(`${path} should have loader and component`, async () => {
        const route = await import(file);
        expect(route.default).toBeDefined(); // Component exists
        expect(route.loader).toBeDefined(); // Loader exists (required for auth check)
      });
    });
  });

  describe('Admin Routes', () => {
    const adminRoutes = [
      { path: '/dashboard/admin', file: '../app/routes/dashboard.admin._index' },
      { path: '/dashboard/admin/analytics', file: '../app/routes/dashboard.admin.analytics' },
      { path: '/dashboard/admin/backfill-hours', file: '../app/routes/dashboard.admin.backfill-hours' },
      { path: '/dashboard/admin/content', file: '../app/routes/dashboard.admin.content' },
      { path: '/dashboard/admin/email-templates', file: '../app/routes/dashboard.admin.email-templates' },
      { path: '/dashboard/admin/events', file: '../app/routes/dashboard.admin.events' },
      { path: '/dashboard/admin/members', file: '../app/routes/dashboard.admin.members' },
      { path: '/dashboard/admin/polls', file: '../app/routes/dashboard.admin.polls' },
    ];

    adminRoutes.forEach(({ path, file }) => {
      it(`${path} should have loader and component`, async () => {
        const route = await import(file);
        expect(route.default).toBeDefined(); // Component exists
        expect(route.loader).toBeDefined(); // Loader exists (required for auth/admin check)
      });
    });
  });

  describe('API Routes', () => {
    it('/api/places/search should have loader', async () => {
      const { loader } = await import('../app/routes/api.places.search');
      expect(loader).toBeDefined();
    });

    it('/api/places/details should have loader', async () => {
      const { loader } = await import('../app/routes/api.places.details');
      expect(loader).toBeDefined();
    });

    it('/api/polls should have loader and action', async () => {
      const route = await import('../app/routes/api.polls');
      expect(route.loader).toBeDefined();
      expect(route.action).toBeDefined();
    });

    it('/api/webhooks/email-rsvp should have action', async () => {
      const { action } = await import('../app/routes/api.webhooks.email-rsvp');
      expect(action).toBeDefined();
    });
  });

  describe('Special Routes', () => {
    it('/accept-invite should have loader and action', async () => {
      const route = await import('../app/routes/accept-invite');
      expect(route.loader).toBeDefined();
      expect(route.action).toBeDefined();
    });

    it('/pending should have loader and component', async () => {
      const route = await import('../app/routes/pending');
      expect(route.default).toBeDefined();
      expect(route.loader).toBeDefined();
    });

    it('/home should have component', async () => {
      const route = await import('../app/routes/home');
      expect(route.default).toBeDefined();
    });
  });

  describe('Route Export Validation', () => {
    it('all dashboard routes should export proper loaders', async () => {
      const routes = [
        '../app/routes/dashboard._index',
        '../app/routes/dashboard.about',
        '../app/routes/dashboard.events',
        '../app/routes/dashboard.members',
        '../app/routes/dashboard.polls',
        '../app/routes/dashboard.profile',
        '../app/routes/dashboard.restaurants',
        '../app/routes/dashboard.rsvp',
      ];

      for (const routePath of routes) {
        const route = await import(routePath);
        expect(route.loader).toBeDefined();
        expect(typeof route.loader).toBe('function');
      }
    });

    it('all admin routes should export proper loaders', async () => {
      const routes = [
        '../app/routes/dashboard.admin._index',
        '../app/routes/dashboard.admin.analytics',
        '../app/routes/dashboard.admin.events',
        '../app/routes/dashboard.admin.members',
        '../app/routes/dashboard.admin.polls',
      ];

      for (const routePath of routes) {
        const route = await import(routePath);
        expect(route.loader).toBeDefined();
        expect(typeof route.loader).toBe('function');
      }
    });

    it('routes with forms should export actions', async () => {
      const routesWithActions = [
        { path: '../app/routes/dashboard.admin.events', name: 'events' },
        { path: '../app/routes/dashboard.admin.members', name: 'members' },
        { path: '../app/routes/dashboard.admin.polls', name: 'polls' },
        { path: '../app/routes/dashboard.polls', name: 'polls voting' },
        { path: '../app/routes/dashboard.rsvp', name: 'rsvp' },
        { path: '../app/routes/accept-invite', name: 'accept-invite' },
      ];

      for (const { path, name } of routesWithActions) {
        const route = await import(path);
        expect(route.action, `${name} should have action`).toBeDefined();
        expect(typeof route.action).toBe('function');
      }
    });
  });

  describe('AUTO-DISCOVERY: All Route Files', () => {
    it('should automatically test all discovered routes', async () => {
      const routesDir = join(__dirname, '../app/routes');
      const routeFiles = discoverRouteFiles(routesDir);

      expect(routeFiles.length).toBeGreaterThan(0);

      const results: { file: string; hasLoader: boolean; hasAction: boolean; hasComponent: boolean }[] = [];

      for (const file of routeFiles) {
        const routePath = `../app/routes/${file.replace('.tsx', '').replace('.ts', '')}`;

        try {
          const route = await import(routePath);

          results.push({
            file,
            hasLoader: !!route.loader,
            hasAction: !!route.action,
            hasComponent: !!route.default,
          });

          // All routes must export at least one of: loader, action, or component
          const hasExports = route.loader || route.action || route.default;
          expect(hasExports, `${file} must export at least loader, action, or default component`).toBeTruthy();

        } catch (err) {
          throw new Error(`Failed to load route ${file}: ${err}`);
        }
      }

      // Log summary for debugging
      console.log(`\n✅ Tested ${results.length} routes:`);
      console.log(`   - ${results.filter(r => r.hasLoader).length} with loaders`);
      console.log(`   - ${results.filter(r => r.hasAction).length} with actions`);
      console.log(`   - ${results.filter(r => r.hasComponent).length} with components`);
    });

    it('should validate dashboard routes have loaders for auth', async () => {
      const routesDir = join(__dirname, '../app/routes');
      const dashboardRoutes = discoverRouteFiles(routesDir).filter(f =>
        f.startsWith('dashboard.') && !f.includes('.test.')
      );

      for (const file of dashboardRoutes) {
        const routePath = `../app/routes/${file.replace('.tsx', '').replace('.ts', '')}`;
        const route = await import(routePath);

        // Dashboard routes should have a loader for authentication checks
        // (except for parent layout routes which might only have components)
        const shouldHaveLoader = !file.endsWith('.tsx') || file.includes('_index') || file.includes('.');

        if (shouldHaveLoader) {
          expect(route.loader, `Dashboard route ${file} should have a loader for auth`).toBeDefined();
        }
      }
    });

    it('should validate API routes have appropriate handlers', async () => {
      const routesDir = join(__dirname, '../app/routes');
      const apiRoutes = discoverRouteFiles(routesDir).filter(f =>
        f.startsWith('api.') && !f.includes('.test.')
      );

      for (const file of apiRoutes) {
        const routePath = `../app/routes/${file.replace('.tsx', '').replace('.ts', '')}`;
        const route = await import(routePath);

        // API routes should have at least a loader or action
        const hasHandler = route.loader || route.action;
        expect(hasHandler, `API route ${file} should have loader or action`).toBeTruthy();
      }
    });
  });
});

/**
 * Helper function to discover all route files
 */
function discoverRouteFiles(dir: string): string[] {
  try {
    const files = readdirSync(dir);
    return files.filter(f =>
      (f.endsWith('.tsx') || f.endsWith('.ts')) &&
      !f.includes('.test.') &&
      !f.endsWith('.d.ts')
    );
  } catch (err) {
    console.warn('Could not read routes directory:', err);
    return [];
  }
}

/**
 * Helper function to create a mock D1 database
 */
function createMockDB() {
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        first: vi.fn(() => Promise.resolve(null)),
        all: vi.fn(() => Promise.resolve({ results: [] })),
        run: vi.fn(() => Promise.resolve({ meta: { last_row_id: 1 } })),
      })),
      first: vi.fn(() => Promise.resolve(null)),
      all: vi.fn(() => Promise.resolve({ results: [] })),
      run: vi.fn(() => Promise.resolve({ meta: { last_row_id: 1 } })),
    })),
  };
}
