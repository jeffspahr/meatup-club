import { Link } from "react-router";

export default function TermsPage() {
  return (
    <main className="page-main">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
          Meatup.Club
        </p>
        <h1 className="mt-3 page-heading">
          Terms & Conditions
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
            <h2 className="section-heading">Service Overview</h2>
            <p className="mt-3">
              Meatup.Club is an invite-only application used to coordinate dining events,
              member RSVPs, and operational reminders. The service is operated by Jeffrey A Spahr,
              doing business as Meatup.Club, as a sole proprietor.
            </p>
          </section>

          <section>
            <h2 className="section-heading">Eligibility & Accounts</h2>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>Access is limited to invited members.</li>
              <li>Members are responsible for account security and accurate contact details.</li>
              <li>Accounts may be suspended for abuse, spam, or unauthorized access.</li>
            </ul>
          </section>

          <section>
            <h2 className="section-heading">SMS Program Terms</h2>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                Program: Meatup.Club event reminders and RSVP updates (no marketing/promotional
                texts).
              </li>
              <li>
                Frequency: message frequency varies by event, typically low volume.
              </li>
              <li>
                Consent: users opt in via profile settings with an explicit SMS consent checkbox.
              </li>
              <li>
                Optionality: SMS reminders are optional and not required to use the service.
              </li>
              <li>
                Opt-out: reply STOP at any time to stop SMS messages.
              </li>
              <li>
                Help: reply HELP for usage instructions.
              </li>
              <li>
                Fees: message and data rates may apply.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="section-heading">Privacy</h2>
            <p className="mt-3">
              Use of the service is also governed by the Privacy Policy at{" "}
              <Link
                to="/privacy"
                className="font-medium text-accent underline underline-offset-2"
              >
                /privacy
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="section-heading">Contact</h2>
            <p className="mt-3">
              Questions about these terms can be sent to{" "}
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
    </main>
  );
}
