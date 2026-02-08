import { Link } from "react-router";
import { ArrowRightIcon } from "@heroicons/react/24/outline";

function LogoMark({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2L2 7l10 5 10-5-10-5z" fill="currentColor" opacity="0.8" />
      <path d="M2 17l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Home() {
  return (
    <main className="landing-shell min-h-screen">
      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 sm:px-10 lg:px-16 py-6 max-w-6xl mx-auto">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white">
            <LogoMark className="w-5 h-5" />
          </span>
          <span className="text-base font-semibold tracking-tight text-foreground">Meatup</span>
        </div>
        <Link to="/login" className="btn-ghost">
          Member Login
        </Link>
      </nav>

      {/* Hero */}
      <section className="relative px-6 sm:px-10 lg:px-16 pt-20 pb-32 sm:pt-28 sm:pb-40">
        {/* Subtle indigo radial glow */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-accent/[0.06] blur-[150px] rounded-full" />
        </div>

        <div className="relative z-10 mx-auto max-w-4xl text-center">
          <p className="animate-fade-in-up text-xs font-semibold uppercase tracking-[0.25em] text-accent mb-8">
            A Private Quarterly Dining Club
          </p>

          <h1 className="animate-fade-in-up-delay-1 landing-heading text-5xl sm:text-6xl lg:text-7xl mb-8">
            The table is set.
            <br />
            Four times a year.
          </h1>

          <p className="animate-fade-in-up-delay-2 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-12 leading-relaxed">
            A members-only dining club that coordinates quarterly steakhouse dinners.
            Vote on restaurants. Pick dates. Show up.
          </p>

          <div className="animate-fade-in-up-delay-3 flex flex-col items-center gap-4">
            <Link to="/login" className="landing-cta">
              Sign In
              <ArrowRightIcon className="w-4 h-4" />
            </Link>
            <p className="text-sm text-muted-foreground">Invitation only</p>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="relative px-6 sm:px-10 lg:px-16 py-24 sm:py-32">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent mb-4">How it works</p>
            <h2 className="text-display-lg text-foreground">Three steps. No friction.</h2>
          </div>

          <div className="grid gap-8 lg:grid-cols-3">
            {[
              {
                step: "01",
                title: "Vote",
                description: "Suggest restaurants and dates. The group decides where to go and when.",
              },
              {
                step: "02",
                title: "Confirm",
                description: "RSVP via web, calendar invite, or a quick SMS reply. Takes under a minute.",
              },
              {
                step: "03",
                title: "Show Up",
                description: "Get a reminder. Enjoy an exceptional dinner with people who care about the details.",
              },
            ].map((item) => (
              <div key={item.step} className="text-center lg:text-left">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-accent/10 text-accent font-semibold text-lg mb-5">
                  {item.step}
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-3">{item.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="px-6 sm:px-10 lg:px-16 py-16">
        <div className="mx-auto max-w-4xl">
          <div className="grid grid-cols-3 gap-8 text-center">
            <div>
              <p className="text-4xl sm:text-5xl font-bold text-foreground tracking-tight">4x</p>
              <p className="text-sm text-muted-foreground mt-2">per year</p>
            </div>
            <div>
              <p className="text-4xl sm:text-5xl font-bold text-foreground tracking-tight">100%</p>
              <p className="text-sm text-muted-foreground mt-2">member-voted</p>
            </div>
            <div>
              <p className="text-4xl sm:text-5xl font-bold text-foreground tracking-tight">&lt;60s</p>
              <p className="text-sm text-muted-foreground mt-2">avg RSVP time</p>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="px-6 sm:px-10 lg:px-16 py-24 sm:py-32">
        <div className="mx-auto max-w-4xl">
          <div className="landing-card p-10 sm:p-14 text-center relative overflow-hidden">
            {/* Gradient border effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-accent-strong/5 pointer-events-none rounded-[inherit]" />

            <div className="relative">
              <h2 className="text-display-lg text-foreground mb-4">
                Ready for the next dinner?
              </h2>
              <p className="text-muted-foreground text-lg mb-8 max-w-lg mx-auto">
                Sign in to vote on restaurants, pick your dates, and secure your seat.
              </p>
              <Link to="/login" className="landing-cta">
                Sign In
                <ArrowRightIcon className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer px-6 py-10 text-center">
        <div className="mx-auto max-w-6xl flex items-center justify-center gap-2.5">
          <LogoMark className="w-5 h-5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            Meatup.Club &middot; {new Date().getFullYear()}
          </span>
        </div>
      </footer>
    </main>
  );
}
