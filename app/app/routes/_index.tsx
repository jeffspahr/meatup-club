import { Link } from "react-router";

export default function Home() {
  return (
    <main className="steak-landing">
      <div className="steak-landing-content">
        <Link to="/login" className="steak-button" aria-label="Sign in to Meatup Club">
          <span className="steak-emoji" role="img" aria-hidden="true">🥩</span>
        </Link>
        <p className="steak-landing-text animate-fade-in-up-delay-2">
          let's meat up
        </p>
      </div>
    </main>
  );
}
