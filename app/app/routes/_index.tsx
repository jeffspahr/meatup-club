import { Link } from "react-router";

export default function Home() {
  return (
    <main className="landing-shell min-h-screen">
      <section className="landing-hero px-6 py-20 sm:px-10 lg:px-16">
        <div className="landing-hero-inner mx-auto max-w-6xl grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-3 landing-pill">
              Meatup.Club
            </div>
            <h1 className="landing-heading text-4xl sm:text-5xl lg:text-6xl leading-tight">
              Steakhouse nights, four times a year.
            </h1>
            <p className="text-lg text-white/80 max-w-xl">
              Member-voted venues. Tight logistics. RSVP by web or text. A dinner club
              that stays simple and feels intentional.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link to="/login" className="landing-cta">
                Member Login
              </Link>
              <Link to="/accept-invite" className="landing-secondary">
                Request an invite
              </Link>
            </div>
            <div className="landing-stat grid grid-cols-3 gap-6 text-sm text-white/75">
              <div>
                <div className="text-2xl font-semibold text-white">4x</div>
                Dinners per year
              </div>
              <div>
                <div className="text-2xl font-semibold text-white">100%</div>
                Member voted
              </div>
              <div>
                <div className="text-2xl font-semibold text-white">&lt; 60s</div>
                Average RSVP
              </div>
            </div>
          </div>
          <div className="landing-card p-6 sm:p-8 text-sm text-[#2b1d16]/90">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-[0.3em] text-[#2b1d16]/60">
                Next dinner
              </div>
              <span className="text-xs font-semibold text-[#2b1d16]/80">
                Invite only
              </span>
            </div>
            <div className="mt-4 space-y-4">
              <div>
                <h2 className="landing-heading text-2xl text-[#2b1d16]">
                  The Peddler Steak House
                </h2>
                <p className="text-sm text-[#2b1d16]/70">
                  Raleigh, NC
                </p>
              </div>
              <div className="landing-surface p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-[#2b1d16]/60">
                  Timing
                </div>
                <p className="mt-2 text-base font-semibold text-[#2b1d16]">
                  Friday, Jan 2 at 7:45 PM
                </p>
                <p className="mt-1 text-sm text-[#2b1d16]/70">
                  RSVP by text or in the dashboard.
                </p>
              </div>
              <div className="landing-highlight text-sm text-[#2b1d16]/80">
                SMS reminders go out 24 hours and 2 hours before dinner. Reply YES or NO.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 py-16 sm:px-10 lg:px-16">
        <div className="mx-auto max-w-6xl grid gap-8 lg:grid-cols-[1fr_1fr]">
          <div className="landing-card p-8">
            <h2 className="landing-heading text-3xl text-[#2b1d16]">
              The dinner lineup lives here.
            </h2>
            <p className="mt-4 text-sm text-[#2b1d16]/70">
              One dashboard keeps the calendar, RSVP status, and reminders in sync so
              the group stays locked in.
            </p>
            <div className="mt-6 flex flex-wrap gap-3 text-xs uppercase tracking-[0.2em] text-[#2b1d16]/60">
              <span>Calendar sync</span>
              <span>SMS reminders</span>
              <span>Admin overrides</span>
            </div>
          </div>
          <div className="landing-card p-8">
            <h2 className="landing-heading text-3xl text-[#2b1d16]">
              Built for a real crew.
            </h2>
            <p className="mt-4 text-sm text-[#2b1d16]/70">
              No marketing blasts. No random drops. Just clear calls, clean RSVPs, and
              fewer loose ends on dinner night.
            </p>
            <div className="mt-6 flex flex-wrap gap-3 text-xs uppercase tracking-[0.2em] text-[#2b1d16]/60">
              <span>Invite only</span>
              <span>Member voted</span>
              <span>Low volume</span>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 pb-20 sm:px-10 lg:px-16">
        <div className="mx-auto max-w-6xl grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="landing-card p-8">
            <h2 className="landing-heading text-3xl text-[#2b1d16]">
              Member notes
            </h2>
            <p className="mt-6 text-lg text-[#2b1d16]/80">
              One page tells me what is next. One text confirms I am in.
            </p>
            <p className="mt-4 text-sm text-[#2b1d16]/60">Johnny J.</p>
          </div>
          <div className="landing-surface p-8">
            <h3 className="landing-heading text-2xl text-[#2b1d16]">
              Keep the seat warm.
            </h3>
            <p className="mt-3 text-sm text-[#2b1d16]/70">
              Members sign in to vote, RSVP, and coordinate the next dinner. Admins
              can step in when the schedule shifts.
            </p>
            <Link to="/login" className="mt-6 inline-flex landing-cta">
              Member Login
            </Link>
          </div>
        </div>
      </section>

      <footer className="landing-footer px-6 py-8 text-center text-xs uppercase tracking-[0.2em]">
        Meatup.Club - a quarterly tradition
      </footer>
    </main>
  );
}
