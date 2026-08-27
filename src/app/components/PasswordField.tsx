"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

type Props = {
  id: string;
  name: string;
  autoComplete?: string;
  required?: boolean;
};

export function PasswordField({ id, name, autoComplete, required }: Props) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="password-field">
      <input
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        required={required}
      />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? "Ocultar codigo" : "Mostrar codigo"}
        title={visible ? "Ocultar codigo" : "Mostrar codigo"}
      >
        {visible ? <EyeOff aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}
      </button>
    </div>
  );
}
