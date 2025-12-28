import type { Route } from "./+types/api.admin.setup-resend";
import { requireAdmin } from "../lib/auth.server";

/**
 * Admin endpoint to configure Resend inbound email routing
 * This sets up rsvp@mail.meatup.club to forward to our webhook
 */
export async function action({ request, context }: Route.ActionArgs) {
  await requireAdmin(request, context);

  const resendApiKey = context.cloudflare.env.RESEND_API_KEY;
  const webhookUrl = 'https://meatup.club/api/webhooks/email-rsvp';

  try {
    console.log('Configuring Resend inbound email route...');

    // Step 1: Get domain ID
    const domainsResponse = await fetch('https://api.resend.com/domains', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!domainsResponse.ok) {
      const error = await domainsResponse.text();
      console.error('Failed to fetch domains:', error);
      return Response.json({
        success: false,
        error: 'Failed to fetch domains from Resend',
        details: error,
      }, { status: 500 });
    }

    const domainsData = await domainsResponse.json();
    console.log('Domains:', domainsData);

    // Find mail.meatup.club domain
    const domain = domainsData.data?.find((d: any) =>
      d.name === 'mail.meatup.club' || d.name === 'meatup.club'
    );

    if (!domain) {
      return Response.json({
        success: false,
        error: 'Domain mail.meatup.club not found in Resend',
        availableDomains: domainsData.data?.map((d: any) => d.name),
      }, { status: 404 });
    }

    console.log('Found domain:', domain);

    // Step 2: Check existing inbound routes
    const routesResponse = await fetch(`https://api.resend.com/domains/${domain.id}/inbound-routes`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
    });

    let existingRoutes = [];
    if (routesResponse.ok) {
      const routesData = await routesResponse.json();
      existingRoutes = routesData.data || [];
      console.log('Existing routes:', existingRoutes);
    }

    // Check if route already exists
    const existingRoute = existingRoutes.find((r: any) =>
      r.pattern === 'rsvp@mail.meatup.club' || r.pattern === 'rsvp'
    );

    if (existingRoute) {
      // Update existing route if URL is different
      if (existingRoute.forward_to === webhookUrl) {
        return Response.json({
          success: true,
          message: 'Inbound route already configured correctly',
          route: existingRoute,
        });
      } else {
        // Delete old route and create new one
        await fetch(`https://api.resend.com/domains/${domain.id}/inbound-routes/${existingRoute.id}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
          },
        });
        console.log('Deleted old route:', existingRoute.id);
      }
    }

    // Step 3: Create new inbound route
    const createRouteResponse = await fetch(`https://api.resend.com/domains/${domain.id}/inbound-routes`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pattern: 'rsvp',
        forward_to: webhookUrl,
      }),
    });

    if (!createRouteResponse.ok) {
      const error = await createRouteResponse.text();
      console.error('Failed to create route:', error);
      return Response.json({
        success: false,
        error: 'Failed to create inbound route',
        details: error,
      }, { status: 500 });
    }

    const newRoute = await createRouteResponse.json();
    console.log('Created inbound route:', newRoute);

    return Response.json({
      success: true,
      message: 'Inbound email route configured successfully!',
      route: newRoute,
      details: {
        email: 'rsvp@mail.meatup.club',
        forwardsTo: webhookUrl,
        domain: domain.name,
      },
    });

  } catch (error) {
    console.error('Resend setup error:', error);
    return Response.json({
      success: false,
      error: 'Failed to configure Resend',
      details: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
