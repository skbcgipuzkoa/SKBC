"use client";

import { useEffect, useRef, type ReactNode } from "react";

type AttendanceDayFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  children: ReactNode;
};

export function AttendanceDayForm({ action, children }: AttendanceDayFormProps) {
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;

    const closeAttendanceFocus = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.closest("[data-close-attendance-focus]")) return;
      target.closest<HTMLDetailsElement>("[data-attendance-group]")?.removeAttribute("open");
    };

    form.addEventListener("click", closeAttendanceFocus);
    return () => form.removeEventListener("click", closeAttendanceFocus);
  }, []);

  return (
    <form ref={formRef} action={action} className="attendance-day-form">
      {children}
    </form>
  );
}
