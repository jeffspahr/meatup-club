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
            Quarterly dinners,
            <br />
            done right.
          </h1>

          <p className="animate-fade-in-up-delay-2 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-12 leading-relaxed">
            Members plan four dinners a year together.
            Vote on the restaurant, pick the date, and RSVP in seconds.
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
              <p className="text-4xl sm:text-5xl font-bold text-foreground tracking-tight">50+</p>
              <p className="text-sm text-muted-foreground mt-2">Raleigh-area steakhouses</p>
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
