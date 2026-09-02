"use client";

import { useEffect, useRef, type ReactNode } from "react";

type PlanTechniqueFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  children: ReactNode;
};

export function PlanTechniqueForm({ action, children }: PlanTechniqueFormProps) {
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;

    const updateCounts = () => {
      const checkboxes = Array.from(form.querySelectorAll<HTMLInputElement>('input[name="planIds"]'));
      const completed = checkboxes.filter((input) => input.checked).length;
      document.querySelectorAll<HTMLElement>("[data-plan-total-count]").forEach((totalCounter) => {
        const label = totalCounter.dataset.planTotalLabel ?? "";
        totalCounter.textContent = `${completed}/${checkboxes.length}${label}`;
      });

      form.querySelectorAll<HTMLElement>("[data-plan-group]").forEach((group) => {
        const groupInputs = Array.from(group.querySelectorAll<HTMLInputElement>('input[name="planIds"]'));
        const groupCompleted = groupInputs.filter((input) => input.checked).length;
        const groupCounter = group.querySelector<HTMLElement>("[data-plan-group-count]");
        if (groupCounter) groupCounter.textContent = `${groupCompleted}/${groupInputs.length}`;
      });

      checkboxes.forEach((input) => {
        input.closest(".plan-card")?.classList.toggle("completed", input.checked);
      });
    };

    updateCounts();
    form.addEventListener("change", updateCounts);
    const closePlanFocus = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.closest("[data-close-plan-focus]")) return;
      target.closest<HTMLDetailsElement>("[data-plan-group]")?.removeAttribute("open");
    };

    form.addEventListener("click", closePlanFocus);
    return () => {
      form.removeEventListener("change", updateCounts);
      form.removeEventListener("click", closePlanFocus);
    };
  }, []);

  return (
    <form ref={formRef} action={action} className="class-plan-form">
      {children}
    </form>
  );
}
