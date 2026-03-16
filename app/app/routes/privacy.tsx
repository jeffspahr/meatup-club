import { Link } from "react-router";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-12 sm:px-10 lg:px-16">
      <div className="mx-auto max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
          Meatup.Club
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-foreground">
          Privacy Policy & SMS Consent
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">Last updated: February 25, 2026</p>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          For public carrier and messaging reviews, use{" "}
          <Link
            to="/verification"
            className="font-medium text-accent underline underline-offset-2"
          >
            /verification
          </Link>
          {" "}for a consolidated business identity and SMS compliance summary.
        </p>

        <div className="mt-10 space-y-8 text-muted-foreground">
          <section>
            <h2 className="text-xl font-semibold text-foreground">Overview</h2>
            <p className="mt-3">
              Meatup.Club is a private dining club application used to coordinate member voting,
              RSVPs, and event reminders. It is operated by Jeffrey A Spahr, doing business as
              Meatup.Club, as a sole proprietor. This page explains how we collect and use
              personal data, including SMS consent.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">Information We Collect</h2>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>Account details: name, email, and profile photo from Google OAuth.</li>
              <li>Club activity: poll votes, RSVPs, comments, and membership status.</li>
              <li>SMS details: mobile number and SMS consent/opt-out status (if enabled).</li>
              <li>Technical data: session cookies and basic security/operational logs.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">How We Use Information</h2>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>Operate the club platform and member dashboard.</li>
              <li>Send event-related notifications by email and SMS (if opted in).</li>
              <li>Maintain platform security and prevent abuse.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">SMS Program Details</h2>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                <span className="font-medium text-foreground">Program name:</span> Meatup.Club
                event reminders
              </li>
              <li>
                <span className="font-medium text-foreground">Message purpose:</span> event
                reminder and RSVP status updates only (no marketing/promotional SMS)
              </li>
              <li>
                <span className="font-medium text-foreground">Message frequency:</span> varies by
                event, typically low volume
              </li>
              <li>
                <span className="font-medium text-foreground">Opt-out:</span> reply STOP at any
                time to stop SMS messages
              </li>
              <li>
                <span className="font-medium text-foreground">Help:</span> reply HELP for usage
                instructions
              </li>
              <li>
                <span className="font-medium text-foreground">Fees:</span> message and data rates
                may apply
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">Proof of Consumer Consent</h2>
            <p className="mt-3">
              Consumers provide SMS consent directly within the authenticated profile settings page.
              Public documentation of the opt-in flow and exact consent language is available at{" "}
              <a
                href="https://meatup.club/sms-consent"
                className="font-medium text-accent underline underline-offset-2"
              >
                https://meatup.club/sms-consent
              </a>
              {" "}and these terms at{" "}
              <a
                href="https://meatup.club/terms"
                className="font-medium text-accent underline underline-offset-2"
              >
                https://meatup.club/terms
              </a>
              .
            </p>
            <p className="mt-3">
              To opt in, a user enters a valid mobile number and checks the box labeled{" "}
              <span className="font-medium text-foreground">
                &quot;I agree to receive SMS reminders from Meatup.Club. Message frequency varies.
                Msg &amp; data rates may apply. Reply HELP for help and STOP to opt out.&quot;
              </span>{" "}
              before saving preferences. SMS reminders are optional and are not required to use
              Meatup.Club. Consent is stored with the user record and can be revoked anytime by
              replying STOP or disabling SMS in profile settings.
            </p>
            <p className="mt-3">
              New enrollees actively opt in using that checkbox. They are not subscribed by default.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">Sharing & Vendors</h2>
            <p className="mt-3">
              We do not sell personal information. We use service providers to operate the
              platform, including Google (authentication), Cloudflare (hosting/database), Resend
              (email), and Twilio (SMS delivery).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">Contact</h2>
            <p className="mt-3">
              Questions about privacy or SMS consent can be sent to{" "}
              <a
                href="mailto:support@meatup.club"
                className="font-medium text-accent underline underline-offset-2"
              >
                support@meatup.club
              </a>
              .
            </p>
          </section>
        </div>

        <div className="mt-12 flex flex-wrap items-center gap-4 border-t border-border pt-6 text-sm">
          <Link to="/" className="text-sm font-medium text-accent hover:text-accent-strong">
            Back to Meatup.Club
          </Link>
          <Link to="/verification" className="text-sm font-medium text-accent hover:text-accent-strong">
            Verification
          </Link>
        </div>
      </div>
    </main>
  );
}
