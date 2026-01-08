import { Link } from "react-router";

export default function Home() {
  return (
    <main className="landing-shell min-h-screen">
      {/* Hero Section */}
      <section className="landing-hero px-6 py-24 sm:px-10 lg:px-16 lg:py-32">
        <div className="landing-hero-inner mx-auto max-w-6xl">
          <div className="grid gap-12 lg:grid-cols-[1.2fr_0.8fr] lg:gap-16 items-center">
            {/* Left: Content */}
            <div className="space-y-8">
              <div className="landing-pill">
                Private Dining Club
              </div>

              <h1 className="landing-heading text-5xl sm:text-6xl lg:text-7xl">
                Steakhouse nights,
                <br />
                <span className="text-accent">four times a year.</span>
              </h1>

              <p className="text-lg sm:text-xl text-foreground/70 max-w-xl leading-relaxed">
                A quarterly tradition of exceptional cuts, great company, and
                effortless coordination. Member-voted venues. Tight logistics.
                No noise.
              </p>

              <div className="flex flex-wrap gap-4 pt-4">
                <Link to="/login" className="landing-cta">
                  Member Login
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 8l4 4m0 0l-4 4m4-4H3"
                    />
                  </svg>
                </Link>
              </div>

              {/* Stats */}
              <div className="landing-stat grid grid-cols-3 gap-8 pt-6 text-sm">
                <div>
                  <div className="landing-stat-value">4x</div>
                  <span className="text-foreground/50">per year</span>
                </div>
                <div>
                  <div className="landing-stat-value">100%</div>
                  <span className="text-foreground/50">member voted</span>
                </div>
                <div>
                  <div className="landing-stat-value">&lt;60s</div>
                  <span className="text-foreground/50">avg RSVP</span>
                </div>
              </div>
            </div>

            {/* Right: Member Flow Card */}
            <div className="landing-card p-8 sm:p-10">
              <div className="flex items-center justify-between mb-8">
                <span className="text-xs font-semibold uppercase tracking-[0.25em] text-foreground/50">
                  How it works
                </span>
                <span className="badge badge-accent">Invite Only</span>
              </div>

              <div className="space-y-5">
                <div className="landing-surface p-5 group transition-all hover:border-accent/30">
                  <div className="flex items-start gap-4">
                    <span className="icon-container shrink-0">
                      <span className="text-lg">01</span>
                    </span>
                    <div>
                      <h3 className="font-semibold text-foreground mb-1">
                        Vote
                      </h3>
                      <p className="text-sm text-foreground/60">
                        Suggest restaurants and dates. The group decides.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="landing-surface p-5 group transition-all hover:border-accent/30">
                  <div className="flex items-start gap-4">
                    <span className="icon-container shrink-0">
                      <span className="text-lg">02</span>
                    </span>
                    <div>
                      <h3 className="font-semibold text-foreground mb-1">
                        Confirm
                      </h3>
                      <p className="text-sm text-foreground/60">
                        RSVP via web, calendar invite, or SMS reply.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="landing-surface p-5 group transition-all hover:border-accent/30">
                  <div className="flex items-start gap-4">
                    <span className="icon-container shrink-0">
                      <span className="text-lg">03</span>
                    </span>
                    <div>
                      <h3 className="font-semibold text-foreground mb-1">
                        Show Up
                      </h3>
                      <p className="text-sm text-foreground/60">
                        Get reminded. Enjoy great steak with great company.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="landing-highlight mt-6 text-center">
                <p className="text-sm font-medium">
                  Two reminders. One tap. No noise.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="relative px-6 py-20 sm:px-10 lg:px-16 lg:py-28">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <span className="text-xs font-semibold uppercase tracking-[0.25em] text-accent mb-4 block">
              Why Meatup.Club
            </span>
            <h2 className="text-display-lg text-foreground">
              Built for crews who keep it tight.
            </h2>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {[
              {
                icon: "01",
                title: "Dinner lineup, locked in.",
                body: "One dashboard for the calendar, RSVP status, and reminders. The group stays in sync without spreadsheets or threads.",
                tags: ["Calendar sync", "SMS reminders", "Override controls"],
              },
              {
                icon: "02",
                title: "Built for a real crew.",
                body: "No marketing blasts. No random drops. Just clear calls, clean RSVPs, and fewer loose ends on dinner night.",
                tags: ["Invite only", "Member voted", "Low volume"],
              },
              {
                icon: "03",
                title: "Zero admin hassle.",
                body: "Auto-reminders, RSVP tracking, and admin overrides that keep the night on track. Set it and forget it.",
                tags: ["Auto-reminders", "Audit trail", "Quick overrides"],
              },
            ].map((card, i) => (
              <div
                key={card.title}
                className="landing-card p-8 h-full flex flex-col card-glow"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className="icon-container-lg mb-6">
                  <span className="font-display text-xl font-semibold text-accent">
                    {card.icon}
                  </span>
                </div>
                <h3 className="text-display-md text-foreground mb-4">
                  {card.title}
                </h3>
                <p className="text-foreground/60 flex-1 leading-relaxed">
                  {card.body}
                </p>
                <div className="mt-6 pt-6 border-t border-border/30 flex flex-wrap gap-2">
                  {card.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs font-medium uppercase tracking-wider text-foreground/40"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="px-6 pb-24 sm:px-10 lg:px-16 lg:pb-32">
        <div className="mx-auto max-w-6xl">
          <div className="landing-card p-10 sm:p-14 relative overflow-hidden">
            {/* Background glow */}
            <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-burgundy/5 pointer-events-none" />

            <div className="relative flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-xl">
                <h2 className="text-display-lg text-foreground mb-4">
                  Keep the seat warm.
                </h2>
                <p className="text-foreground/60 text-lg leading-relaxed">
                  Members sign in to vote, RSVP, and coordinate the next dinner.
                  Admins can step in when the schedule shifts.
                </p>
              </div>
              <Link to="/login" className="landing-cta shrink-0">
                Member Login
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 8l4 4m0 0l-4 4m4-4H3"
                  />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer px-6 py-10 text-center">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center justify-center gap-3 mb-4">
            <span className="text-2xl">🥩</span>
            <span className="font-display text-xl font-semibold text-foreground">
              Meatup.Club
            </span>
          </div>
          <p className="text-xs uppercase tracking-[0.25em] text-foreground/40">
            A quarterly tradition
          </p>
        </div>
      </footer>
    </main>
  );
}
