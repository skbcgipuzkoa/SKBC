"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { mergePlanDraft, parsePlanDraft, planDraftKey, planSelectionsAgree, type PlanSelection } from "@/lib/plan-selection-draft";

type PlanTechniqueFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  children: ReactNode;
  classId: string;
  serverSelection: PlanSelection;
  className?: string;
  primaryForm?: string;
};

export function PlanTechniqueForm({ action, children, classId, serverSelection, className = "class-plan-form", primaryForm }: PlanTechniqueFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [storageWarning, setStorageWarning] = useState(false);
  const signature = JSON.stringify(serverSelection);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const server: PlanSelection = JSON.parse(signature);
    const inputs = () => Array.from(form.querySelectorAll<HTMLInputElement>('input[type="checkbox"][name="planIds"]'));
    if (!inputs().length) return;
    const snapshot = () => Object.fromEntries(inputs().map((input) => [input.value, input.checked]));
    const key = planDraftKey(classId);
    const persist = () => {
      const selection = snapshot();
      try {
        if (planSelectionsAgree(server, selection)) sessionStorage.removeItem(key);
        else sessionStorage.setItem(key, JSON.stringify(selection));
        setStorageWarning(false);
        return true;
      } catch {
        setStorageWarning(true);
        return planSelectionsAgree(server, selection);
      }
    };
    inputs().forEach((input) => { input.checked = server[input.value] ?? input.defaultChecked; });
    try {
      const draft = parsePlanDraft(sessionStorage.getItem(key));
      if (draft) {
        if (planSelectionsAgree(server, draft)) sessionStorage.removeItem(key);
        else {
          const merged = mergePlanDraft(server, draft);
          inputs().forEach((input) => { input.checked = merged[input.value] ?? input.defaultChecked; });
        }
      }
    } catch { setStorageWarning(true); }

    const updateCounts = () => {
      const checkboxes = inputs();
      const completed = checkboxes.filter((input) => input.checked).length;
      document.querySelectorAll<HTMLElement>("[data-plan-total-count]").forEach((counter) => {
        counter.textContent = `${completed}/${checkboxes.length}${counter.dataset.planTotalLabel ?? ""}`;
      });
      form.querySelectorAll<HTMLElement>("[data-plan-group], .dojo-grade-panel").forEach((group) => {
        const groupInputs = Array.from(group.querySelectorAll<HTMLInputElement>('input[name="planIds"]'));
        const counter = group.querySelector<HTMLElement>("[data-plan-group-count], summary em");
        if (counter) counter.textContent = `${groupInputs.filter((input) => input.checked).length}/${groupInputs.length}`;
      });
      checkboxes.forEach((input) => input.closest(".plan-card")?.classList.toggle("completed", input.checked));
    };
    const change = () => { persist(); updateCounts(); };
    const guardNavigation = (event: SubmitEvent) => {
      const other = event.target;
      if (!(other instanceof HTMLFormElement) || other === form) return;
      const otherClass = other.querySelector<HTMLInputElement>('input[name="classId"]')?.value;
      if (otherClass !== classId) return;
      if (!persist()) {
        event.preventDefault();
        event.stopPropagation();
        setStorageWarning(true);
      }
    };
    const closePlanFocus = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.closest("[data-close-plan-focus]")) return;
      target.closest<HTMLDetailsElement>("[data-plan-group]")?.removeAttribute("open");
    };
    const preventReset = (event: Event) => event.preventDefault();
    updateCounts();
    form.addEventListener("reset", preventReset);
    form.addEventListener("change", change);
    form.addEventListener("submit", persist);
    document.addEventListener("submit", guardNavigation, true);
    form.addEventListener("click", closePlanFocus);
    return () => {
      form.removeEventListener("reset", preventReset);
      form.removeEventListener("change", change);
      form.removeEventListener("submit", persist);
      document.removeEventListener("submit", guardNavigation, true);
      form.removeEventListener("click", closePlanFocus);
    };
  }, [classId, signature]);

  return <form ref={formRef} action={action} className={className} data-class-primary-form={primaryForm}>
    {storageWarning ? <p role="alert">No se puede conservar el borrador en esta pestaña. Guarda primero las técnicas del plan antes de añadir o quitar extras.</p> : null}
    {children}
  </form>;
}
