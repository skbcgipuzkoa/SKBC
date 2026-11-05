"use client";

import { useState, type CSSProperties } from "react";

export function BirthdayRibbon({ name }: { name: string }) {
  const [paused, setPaused] = useState(false);
  return (
    <section className="birthday-celebration" aria-label="Felicitación de cumpleaños" data-paused={paused}>
      <div className="birthday-confetti" aria-hidden="true">
        {Array.from({ length: 32 }, (_, index) => (
          <i key={index} style={{ "--x": `${(index * 37) % 100}%`, "--delay": `${(index % 8) * 0.055}s`, "--drift": `${((index * 19) % 100) - 50}px`, "--color": ["#51e0aa", "#67bcff", "#ffffff", "#c6a8ff"][index % 4] } as CSSProperties} />
        ))}
      </div>
      <div className="birthday-ribbon">
        <span className="birthday-eyebrow">HOY CELEBRAMOS CONTIGO</span>
        <h2>ZORIONAK!!!</h2>
        <p>{name}, ¡feliz cumpleaños!</p>
      </div>
      <button className="birthday-motion-toggle" type="button" aria-pressed={paused} onClick={() => setPaused(!paused)}>
        {paused ? "Reanudar animación" : "Pausar animación"}
      </button>
    </section>
  );
}
