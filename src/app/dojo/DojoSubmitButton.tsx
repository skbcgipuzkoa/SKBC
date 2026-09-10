"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

type DojoSubmitButtonProps = {
  children: ReactNode;
  pendingLabel?: string;
  className?: string;
  confirmMessage?: string;
};

export function DojoSubmitButton({
  children,
  pendingLabel = "Guardando...",
  className = "dojo-primary-button",
  confirmMessage
}: DojoSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      className={className}
      type="submit"
      disabled={pending}
      aria-busy={pending}
      onClick={(event) => {
        if (!pending && confirmMessage && !window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
