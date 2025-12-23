export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-meat-brown to-meat-red text-white p-8">
      <div className="max-w-2xl text-center space-y-8">
        <h1 className="text-6xl font-bold mb-4">🥩 Meatup.Club</h1>

        <p className="text-2xl mb-8">
          An exclusive gathering of meat enthusiasts
        </p>

        <p className="text-lg opacity-90 mb-12">
          Four times a year, a small group of friends comes together to celebrate
          the finest cuts at the best steakhouses. Members vote on locations,
          dates, and share their passion for quality meat.
        </p>

        <div className="space-y-4">
          <a
            href="/api/auth/signin"
            className="inline-block bg-white text-meat-red px-8 py-4 rounded-lg font-bold text-xl hover:bg-opacity-90 transition"
          >
            Sign in with Google
          </a>

          <p className="text-sm opacity-75">
            Members only. By invitation.
          </p>
        </div>
      </div>
    </main>
  )
}
