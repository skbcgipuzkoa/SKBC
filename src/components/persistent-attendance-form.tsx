"use client";

import { addBulkAttendanceAction } from "@/app/actions";
import { type ReactNode, useEffect, useRef } from "react";

export function PersistentAttendanceForm({ storageKey, className, children }: { storageKey: string; className: string; children: ReactNode }) {
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const saved = new Set(readDraft(storageKey));
    form.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((input) => {
      if (saved.has(`${input.name}:${input.value}`)) input.checked = true;
    });
  }, [storageKey]);

  function saveDraft() {
    const form = formRef.current;
    if (!form) return;
    const checked = Array.from(form.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked'))
      .map((input) => `${input.name}:${input.value}`);
    window.sessionStorage.setItem(storageKey, JSON.stringify(checked));
  }

  return (
    <form action={addBulkAttendanceAction} className={className} ref={formRef} onChange={saveDraft} onSubmit={() => window.sessionStorage.removeItem(storageKey)}>
      {children}
    </form>
  );
}

function readDraft(key: string) {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}
