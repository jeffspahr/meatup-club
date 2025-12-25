import { Link } from "react-router";

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-meat-brown to-meat-red text-white">
      {/* Hero Section */}
      <div className="flex flex-col items-center justify-center px-8 py-20">
        <div className="max-w-4xl text-center space-y-8">
          <h1 className="text-7xl font-bold mb-4">🥩 Meatup.Club</h1>

          <p className="text-3xl font-semibold mb-8">
            Your Quarterly Steakhouse Society
          </p>

          <p className="text-xl opacity-90 max-w-2xl mx-auto mb-12">
            A private platform for friends who appreciate fine dining. Organize quarterly
            gatherings, vote democratically, and make every meetup memorable.
          </p>

          <Link
            to="/login"
            className="inline-block bg-white text-meat-red px-10 py-5 rounded-lg font-bold text-2xl hover:bg-opacity-90 transition shadow-2xl"
          >
            Sign in with Google
          </Link>

          <p className="text-sm opacity-75 mt-4">
            🔒 Members only · By invitation
          </p>
        </div>
      </div>

      {/* Features Section */}
      <div className="bg-white/10 backdrop-blur-sm py-16 px-8">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-12">How It Works</h2>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Poll-Based Voting */}
            <div className="bg-white/20 rounded-lg p-6 backdrop-blur-sm">
              <div className="text-5xl mb-4">🗳️</div>
              <h3 className="text-xl font-bold mb-3">Poll-Based Voting</h3>
              <p className="text-white/90 text-sm">
                Start voting rounds for each gathering. Members suggest and vote on
                restaurants and dates within time-bound polls.
              </p>
            </div>

            {/* Restaurant Discovery */}
            <div className="bg-white/20 rounded-lg p-6 backdrop-blur-sm">
              <div className="text-5xl mb-4">🔍</div>
              <h3 className="text-xl font-bold mb-3">Smart Restaurant Search</h3>
              <p className="text-white/90 text-sm">
                Powered by Google Places. Autocomplete search with ratings, photos,
                hours, and full details automatically populated.
              </p>
            </div>

            {/* Democratic Decisions */}
            <div className="bg-white/20 rounded-lg p-6 backdrop-blur-sm">
              <div className="text-5xl mb-4">✅</div>
              <h3 className="text-xl font-bold mb-3">Democratic Decisions</h3>
              <p className="text-white/90 text-sm">
                Every member gets a vote. Top-voted restaurant and date automatically
                determine your next gathering.
              </p>
            </div>

            {/* RSVP Management */}
            <div className="bg-white/20 rounded-lg p-6 backdrop-blur-sm">
              <div className="text-5xl mb-4">📋</div>
              <h3 className="text-xl font-bold mb-3">Easy RSVPs</h3>
              <p className="text-white/90 text-sm">
                Simple Yes/No/Maybe responses. Add dietary restrictions. See who's
                attending at a glance.
              </p>
            </div>

            {/* Event History */}
            <div className="bg-white/20 rounded-lg p-6 backdrop-blur-sm">
              <div className="text-5xl mb-4">📅</div>
              <h3 className="text-xl font-bold mb-3">Event Management</h3>
              <p className="text-white/90 text-sm">
                Automatically create events from poll winners. Track upcoming and past
                gatherings all in one place.
              </p>
            </div>

            {/* Admin Tools */}
            <div className="bg-white/20 rounded-lg p-6 backdrop-blur-sm">
              <div className="text-5xl mb-4">⚙️</div>
              <h3 className="text-xl font-bold mb-3">Admin Controls</h3>
              <p className="text-white/90 text-sm">
                Close polls with winners, manage members, send invitations, and
                override decisions when needed.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="py-20 px-8 text-center">
        <div className="max-w-2xl mx-auto space-y-6">
          <h2 className="text-4xl font-bold">Ready to Join?</h2>
          <p className="text-xl opacity-90">
            Members collaborate to make every quarterly gathering exceptional.
          </p>
          <Link
            to="/login"
            className="inline-block bg-white text-meat-red px-10 py-5 rounded-lg font-bold text-xl hover:bg-opacity-90 transition shadow-2xl"
          >
            Member Sign In
          </Link>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-black/20 py-6 text-center">
        <p className="text-sm opacity-75">
          © 2025 Meatup.Club · A quarterly tradition
        </p>
      </div>
    </main>
  );
}
