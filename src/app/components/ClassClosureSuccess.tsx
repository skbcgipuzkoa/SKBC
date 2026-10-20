"use client";

import { Check } from "lucide-react";
import { useState } from "react";

type Props = {
  detail?: string;
};

export function ClassClosureSuccess({ detail = "Todos los datos han quedado guardados." }: Props) {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  return (
    <div className="class-closing-overlay class-closing-success-overlay" role="alertdialog" aria-modal="true" aria-labelledby="class-close-success-title">
      <section className="class-closing-dialog class-closing-success-dialog">
        <span className="class-closing-success-icon" aria-hidden="true"><Check size={46} strokeWidth={3} /></span>
        <h2 id="class-close-success-title">Se ha cerrado correctamente la clase</h2>
        <p>{detail}</p>
        <p className="class-closing-success-exit">Ya puedes salir de esta ventana.</p>
        <button type="button" onClick={() => setVisible(false)}>Entendido</button>
      </section>
    </div>
  );
}
