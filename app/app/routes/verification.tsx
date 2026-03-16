import { Link } from "react-router";

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3">
      <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-2 text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

function PublicLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      className="block rounded-2xl border border-border bg-card px-4 py-3 text-sm font-medium text-accent underline-offset-2 hover:text-accent-strong hover:underline"
    >
      {href}
    </a>
  );
}

export default function VerificationPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-12 sm:px-10 lg:px-16">
      <div className="mx-auto max-w-5xl">
        <div className="rounded-[2rem] border border-accent/20 bg-accent/[0.04] px-6 py-8 shadow-sm sm:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent">
            Meatup.Club
          </p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Business Verification & SMS Compliance
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
            This page is public and does not require a login. It is provided for carrier,
            messaging, and business verification reviews, including Twilio toll-free verification.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-accent/20 bg-background px-3 py-1 text-sm font-medium text-foreground">
              Public review URL
            </span>
            <a
              href="https://meatup.club/verification"
              className="text-sm font-semibold text-accent underline underline-offset-2"
            >
              https://meatup.club/verification
            </a>
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.35fr_1fr]">
          <section className="rounded-[2rem] border border-border bg-card px-6 py-7 shadow-sm sm:px-8">
            <h2 className="text-2xl font-semibold text-foreground">Business identity</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Meatup.Club is an invite-only dining club application used to coordinate member
              voting, RSVPs, and event reminders. The service is operated by Jeffrey A Spahr,
              doing business as Meatup.Club, as a sole proprietor.
            </p>
            <dl className="mt-6 grid gap-3 sm:grid-cols-2">
              <DetailRow label="Legal entity" value="Jeffrey A Spahr" />
              <DetailRow label="DBA / brand" value="Meatup.Club" />
              <DetailRow label="Business type" value="Sole proprietor" />
              <DetailRow label="Contact email" value="support@meatup.club" />
              <DetailRow label="Primary website" value="https://meatup.club/" />
              <DetailRow label="Service model" value="Invite-only dining club coordination" />
            </dl>
          </section>

          <section className="rounded-[2rem] border border-border bg-card px-6 py-7 shadow-sm sm:px-8">
            <h2 className="text-2xl font-semibold text-foreground">Public review links</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              All of the following pages are public and available without authentication.
            </p>
            <div className="mt-6 space-y-3">
              <PublicLink href="https://meatup.club/verification" />
              <PublicLink href="https://meatup.club/privacy" />
              <PublicLink href="https://meatup.club/terms" />
              <PublicLink href="https://meatup.club/sms-consent" />
            </div>
          </section>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <section className="rounded-[2rem] border border-border bg-card px-6 py-7 shadow-sm sm:px-8">
            <h2 className="text-2xl font-semibold text-foreground">SMS program details</h2>
            <ul className="mt-5 space-y-3 text-sm leading-6 text-muted-foreground">
              <li>
                <span className="font-semibold text-foreground">Program name:</span> Meatup.Club
                event reminders
              </li>
              <li>
                <span className="font-semibold text-foreground">Purpose:</span> event reminders and
                RSVP status updates only
              </li>
              <li>
                <span className="font-semibold text-foreground">Marketing:</span> no promotional
                or marketing SMS
              </li>
              <li>
                <span className="font-semibold text-foreground">Message frequency:</span> varies by
                event, typically low volume
              </li>
              <li>
                <span className="font-semibold text-foreground">Opt-out:</span> reply STOP at any
                time
              </li>
              <li>
                <span className="font-semibold text-foreground">Help:</span> reply HELP for usage
                instructions
              </li>
              <li>
                <span className="font-semibold text-foreground">Fees:</span> message and data
                rates may apply
              </li>
              <li>
                <span className="font-semibold text-foreground">Optionality:</span> SMS reminders
                are optional and are not required to use the service
              </li>
            </ul>
          </section>

          <section className="rounded-[2rem] border border-border bg-card px-6 py-7 shadow-sm sm:px-8">
            <h2 className="text-2xl font-semibold text-foreground">Authentication boundary</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Meatup.Club is invite-only, so the member dashboard and profile settings require
              login. That authentication gate exists to protect member data, not to hide business
              information or consent terms. The business identity, SMS program details, privacy
              policy, terms, and opt-in documentation are all public on the links above.
            </p>
            <div className="mt-5 rounded-2xl border border-accent/20 bg-accent/[0.04] px-4 py-4 text-sm leading-6 text-muted-foreground">
              Reviewers who need business or consent information should use this page,
              <span className="font-medium text-foreground"> /privacy</span>,
              <span className="font-medium text-foreground"> /terms</span>, and
              <span className="font-medium text-foreground"> /sms-consent</span>. No login is
              required for those pages.
            </div>
          </section>
        </div>

        <section className="mt-8 rounded-[2rem] border border-border bg-card px-6 py-7 shadow-sm sm:px-8">
          <h2 className="text-2xl font-semibold text-foreground">How consent is collected</h2>
          <ol className="mt-5 list-decimal space-y-3 pl-6 text-sm leading-6 text-muted-foreground">
            <li>Members sign in to their invite-only Meatup.Club account.</li>
            <li>Members open profile settings and enter a valid US mobile number.</li>
            <li>Members optionally check the SMS consent box. It is not checked by default.</li>
            <li>Members save preferences to enroll in event reminder SMS.</li>
            <li>
              Members can opt out at any time by replying STOP or by disabling SMS in profile
              settings.
            </li>
          </ol>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
            <div className="rounded-[1.75rem] border border-border bg-background px-5 py-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Profile form excerpt
              </p>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                The authenticated profile page includes the following optional SMS enrollment
                controls.
              </p>
              <div className="mt-5 space-y-4 rounded-2xl border border-border bg-card px-4 py-4">
                <div>
                  <label className="block text-sm font-medium text-foreground">
                    Mobile Number (US)
                  </label>
                  <div className="mt-2 rounded-xl border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
                    555-123-4567
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-xl border border-border bg-background px-3 py-3">
                  <input
                    type="checkbox"
                    disabled
                    className="mt-1 h-4 w-4 rounded border-border text-accent"
                  />
                  <div>
                    <p className="text-sm font-medium leading-6 text-foreground">
                      I agree to receive SMS reminders from Meatup.Club. Message frequency varies.
                      Msg &amp; data rates may apply. Reply HELP for help and STOP to opt out.
                    </p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      Reminder and RSVP update messages only. No marketing texts.
                    </p>
                  </div>
                </div>
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  Unchecked by default for new enrollment
                </p>
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-accent/20 bg-accent/[0.04] px-5 py-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
                Consent notes
              </p>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
                <li>SMS consent is captured directly from the end user.</li>
                <li>Users are not subscribed by default and must actively opt in.</li>
                <li>Consent is tied to the member record and stored with the submitted phone number.</li>
                <li>SMS reminders are optional and are not required to use Meatup.Club.</li>
                <li>The same consent language is documented publicly at /privacy and /sms-consent.</li>
              </ul>
            </div>
          </div>
        </section>

        <div className="mt-10 flex flex-wrap items-center gap-4 border-t border-border pt-6 text-sm">
          <Link to="/" className="font-medium text-accent hover:text-accent-strong">
            Home
          </Link>
          <Link to="/privacy" className="font-medium text-accent hover:text-accent-strong">
            Privacy
          </Link>
          <Link to="/terms" className="font-medium text-accent hover:text-accent-strong">
            Terms
          </Link>
          <Link to="/sms-consent" className="font-medium text-accent hover:text-accent-strong">
            SMS Consent
          </Link>
        </div>
      </div>
    </main>
  );
}
