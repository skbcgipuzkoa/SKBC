"use client";

import { useFormStatus } from "react-dom";

export function ConfirmSubmitButton({ message, children, className = "danger-button" }: { message: string; children: string; className?: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" className={className} disabled={pending} onClick={(event) => {
    if (!window.confirm(message)) event.preventDefault();
  }}>{pending ? "Procesando..." : children}</button>;
}
