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

    const openAttendanceFocus = (event: MouseEvent) => {
      const target = event.target;
      const summary = target instanceof HTMLElement ? target.closest("summary") : null;
      const group = summary?.closest<HTMLElement>("[data-attendance-group]");
      if (!group || !window.matchMedia("(max-width: 1180px)").matches) return;
      group.classList.add("attendance-focus-open");
    };

    const closeAttendanceFocus = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.closest("[data-close-attendance-focus]")) return;
      target.closest<HTMLElement>("[data-attendance-group]")?.classList.remove("attendance-focus-open");
    };

    form.addEventListener("click", openAttendanceFocus);
    form.addEventListener("click", closeAttendanceFocus);
    return () => {
      form.removeEventListener("click", openAttendanceFocus);
      form.removeEventListener("click", closeAttendanceFocus);
    };
  }, []);

  return (
    <form ref={formRef} action={action} className="attendance-day-form">
      {children}
    </form>
  );
}
