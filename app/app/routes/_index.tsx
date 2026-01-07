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
          <div className="landing-card p-6 sm:p-8 text-sm text-slate-700">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-[0.3em] text-slate-500">
                Member flow
              </div>
              <span className="text-xs font-semibold text-slate-500">
                Invite only
              </span>
            </div>
            <div className="mt-6 space-y-5">
              <div className="landing-surface p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                  Vote
                </div>
                <p className="mt-2 text-base font-semibold text-slate-900">
                  Suggest restaurants and dates.
                </p>
              </div>
              <div className="landing-surface p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                  Confirm
                </div>
                <p className="mt-2 text-base font-semibold text-slate-900">
                  RSVP on web, calendar, or SMS.
                </p>
              </div>
              <div className="landing-highlight text-sm text-slate-700">
                Two reminders. One tap. No noise.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 py-16 sm:px-10 lg:px-16">
        <div className="mx-auto max-w-6xl grid gap-8 lg:grid-cols-3">
          {[
            {
              title: "The dinner lineup lives here.",
              body:
                "One dashboard keeps the calendar, RSVP status, and reminders in sync so the group stays locked in.",
              tags: ["Calendar sync", "SMS reminders", "Admin overrides"],
            },
            {
              title: "Built for a real crew.",
              body:
                "No marketing blasts. No random drops. Just clear calls, clean RSVPs, and fewer loose ends on dinner night.",
              tags: ["Invite only", "Member voted", "Low volume"],
            },
            {
              title: "Minimal admin overhead.",
              body:
                "Auto-reminders, RSVP tracking, and override controls that keep the night on track without a spreadsheet.",
              tags: ["Overrides", "Reminders", "Audit trail"],
            },
          ].map((card) => (
            <div key={card.title} className="landing-card p-8 h-full flex flex-col">
              <h2 className="landing-heading text-2xl text-slate-900">
                {card.title}
              </h2>
              <p className="mt-4 text-sm text-slate-600 flex-1">
                {card.body}
              </p>
              <div className="mt-6 flex flex-wrap gap-3 text-xs uppercase tracking-[0.2em] text-slate-500">
                {card.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="px-6 pb-20 sm:px-10 lg:px-16">
        <div className="mx-auto max-w-6xl landing-surface p-8 flex flex-col gap-6 items-start lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="landing-heading text-2xl text-slate-900">
              Keep the seat warm.
            </h3>
            <p className="mt-3 text-sm text-slate-600">
              Members sign in to vote, RSVP, and coordinate the next dinner. Admins
              can step in when the schedule shifts.
            </p>
          </div>
          <Link to="/login" className="inline-flex landing-cta">
            Member Login
          </Link>
        </div>
      </section>

      <footer className="landing-footer px-6 py-8 text-center text-xs uppercase tracking-[0.2em]">
        Meatup.Club - a quarterly tradition
      </footer>
    </main>
  );
}
