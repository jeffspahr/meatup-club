import { Link } from "react-router";

export default function SmsConsentPage() {
  return (
    <main className="page-main">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
          Meatup.Club
        </p>
        <h1 className="mt-3 page-heading">
          SMS Consent & Opt-In
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">Last updated: August 22, 2026</p>
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
            <h2 className="section-heading">Program operator</h2>
            <p className="mt-3">
              This SMS program is operated by Jeffrey A Spahr, doing business as Meatup.Club, as a
              sole proprietor.
            </p>
          </section>

          <section>
            <h2 className="section-heading">How Users Opt In</h2>
            <h3 className="mt-3 font-medium text-foreground">Profile opt-in</h3>
            <ol className="mt-3 list-decimal space-y-2 pl-6">
              <li>Sign in to Meatup.Club.</li>
              <li>Go to Profile settings.</li>
              <li>Enter a valid mobile number.</li>
              <li>
                Check the optional SMS consent box (not checked by default for new enrollment) that
                states:{" "}
                <span className="font-medium text-foreground">
                  "I agree to receive SMS reminders from Meatup.Club. Message frequency varies. Msg
                  & data rates may apply. Reply HELP for help and STOP to opt out."
                </span>
              </li>
              <li>Save preferences to enroll in SMS reminders.</li>
            </ol>
            <h3 className="mt-6 font-medium text-foreground">Keyword opt-in</h3>
            <ol className="mt-3 list-decimal space-y-2 pl-6">
              <li>A mobile number is linked to an invited member account.</li>
              <li>
                Linking or prefilling a number does not grant consent and does not enable SMS.
              </li>
              <li>
                The member is shown or given this call to action outside SMS: &quot;Text START to
                888-857-MEAT to receive Meatup.Club event reminders and RSVP updates. Message
                frequency varies. Message and data rates may apply. Reply STOP to unsubscribe or
                HELP for help. Consent is optional. See meatup.club/terms and
                meatup.club/privacy.&quot;
              </li>
              <li>The member texts START or UNSTOP from the linked number to enroll.</li>
            </ol>
          </section>

          <section>
            <h2 className="section-heading">Program Details</h2>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>Purpose: event reminders and RSVP status updates only.</li>
              <li>Frequency: varies by event, typically low volume.</li>
              <li>Opt-out: reply STOP at any time.</li>
              <li>Enrollment or re-enrollment by keyword: reply START or UNSTOP.</li>
              <li>Help: reply HELP for instructions.</li>
              <li>Fees: message and data rates may apply.</li>
            </ul>
            <p className="mt-3">
              SMS reminders are optional and are not required to use Meatup.Club.
            </p>
          </section>

          <section>
            <h2 className="section-heading">Contact</h2>
            <p className="mt-3">
              Questions about SMS consent can be sent to{" "}
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

        <div className="mt-12 border-t border-border pt-6 flex items-center gap-4 text-sm">
          <Link to="/verification" className="font-medium text-accent hover:text-accent-strong">
            Verification
          </Link>
          <Link to="/privacy" className="font-medium text-accent hover:text-accent-strong">
            Privacy
          </Link>
          <Link to="/terms" className="font-medium text-accent hover:text-accent-strong">
            Terms
          </Link>
      </div>
    </main>
  );
}
