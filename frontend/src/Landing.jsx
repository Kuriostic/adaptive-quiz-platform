export default function Landing({ onStart }) {
  const steps = [
    ["1", "Enter a topic", "Type any subject you want to practice."],
    ["2", "AI builds your quiz", "A Large Language Model writes MCQs with difficulty levels."],
    ["3", "Difficulty adapts", "Each answer updates your ability using an IRT-based model."],
    ["4", "See your growth", "Get a score, ability graph and explanations."],
  ];

  const features = [
    ["AI Question Generation", "Fresh MCQs on any topic, generated in seconds.", true],
    ["Adaptive Difficulty", "Rasch (1PL IRT) model picks the next question for you.", true],
    ["Instant Explanations", "Learn why an answer is right or wrong.", true],
    ["Ability Graph", "Track how your level changes question by question.", true],
    ["PDF & Notes Upload", "Generate quizzes from your own study material.", false],
    ["Teacher Dashboard", "Class-wide analytics and weak-topic tracking.", false],
  ];

  return (
    <div className="lp">
      <nav className="lp-nav">
        <div className="lp-logo">AdaptiveQuiz<span>.ai</span></div>
        <button className="lp-btn small" onClick={onStart}>Try Demo</button>
      </nav>

      <section className="lp-hero">
        <div className="lp-hero-text">
          <span className="lp-pill">B.Tech CSE Major Project</span>
          <h1>Quizzes that learn <br />how <em>you</em> learn.</h1>
          <p>
            An AI-powered platform that generates questions on any topic and
            adjusts their difficulty in real time, based on your performance.
          </p>
          <div className="lp-cta">
            <button className="lp-btn" onClick={onStart}>Start a Quiz</button>
            <a className="lp-link" href="#how">See how it works</a>
          </div>
        </div>

        <div className="lp-preview">
          <div className="lp-prev-top">
            <span>Question 3 of 8</span>
            <span className="lp-chip">Difficulty 4/5</span>
          </div>
          <div className="lp-prev-q">Which scheduling algorithm can cause the convoy effect?</div>
          <div className="lp-prev-opt">A. Round Robin</div>
          <div className="lp-prev-opt good">B. First-Come, First-Served</div>
          <div className="lp-prev-opt">C. Priority Scheduling</div>
          <div className="lp-prev-foot">Your ability: <b>3.4</b> → <b>3.9</b> ↑</div>
        </div>
      </section>

      <section className="lp-section" id="how">
        <h2>How it works</h2>
        <div className="lp-steps">
          {steps.map(([n, t, d]) => (
            <div className="lp-step" key={n}>
              <div className="lp-num">{n}</div>
              <h3>{t}</h3>
              <p>{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-section alt">
        <h2>Features</h2>
        <div className="lp-feats">
          {features.map(([t, d, live]) => (
            <div className="lp-feat" key={t}>
              <span className={live ? "tag live" : "tag soon"}>{live ? "Live" : "Coming soon"}</span>
              <h3>{t}</h3>
              <p>{d}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="lp-foot">
        
      </footer>
    </div>
  );
}