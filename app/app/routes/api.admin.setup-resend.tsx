import type { AppLoadContext } from "react-router";
import { requireAdmin } from "../lib/auth.server";
import { ensureResendEmailSetup } from "../lib/resend-setup.server";
import { logErrorEvent } from "../lib/observability.server";

/**
 * Admin endpoint to configure Resend delivery tracking.
 */
export async function action({
  request,
  context,
}: {
  request: Request;
  context: AppLoadContext;
}) {
  await requireAdmin(request, context);

  const resendApiKey = context.cloudflare.env.RESEND_API_KEY;
  if (!resendApiKey) {
    return Response.json(
      {
        success: false,
        error: "RESEND_API_KEY is not configured",
      },
      { status: 500 }
    );
  }

  try {
    const details = await ensureResendEmailSetup({
      db: context.cloudflare.env.DB,
      resendApiKey,
    });

    return Response.json({
      success: true,
      message: "Resend delivery tracking configured successfully.",
      details,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logErrorEvent("resend_setup_failed", error);
    return Response.json(
      {
        success: false,
        error: "Failed to configure Resend",
        details: message,
      },
      { status: 500 }
    );
  }
}
