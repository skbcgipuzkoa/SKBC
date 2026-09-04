"use client";

import { useFormStatus } from "react-dom";

type Props = {
  children: React.ReactNode;
  className?: string;
  pendingLabel?: string;
};

export function SubmitButton({ children, className, pendingLabel = "Guardando..." }: Props) {
  const { pending } = useFormStatus();

  return (
    <button className={className} type="submit" disabled={pending} aria-busy={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}
