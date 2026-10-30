"use client";

import { Check, ChevronLeft, ChevronRight, LockKeyhole, Save, X } from "lucide-react";
import { MouseEvent, useEffect, useRef, useState } from "react";

export type ClassSectionLink = {
  id: string;
  label: string;
  href: string;
  done?: boolean;
};

export function ClassSectionNav({
  links,
  current,
  correctionLabel
}: {
  links: ClassSectionLink[];
  current: string;
  correctionLabel?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [destination, setDestination] = useState("");
  const [dirtyForms, setDirtyForms] = useState<HTMLFormElement[]>([]);
  const [hasActivePrimaryForm, setHasActivePrimaryForm] = useState(false);
  const currentIndex = links.findIndex((link) => link.id === current);
  const previous = currentIndex > 0 ? links[currentIndex - 1] : null;
  const next = currentIndex >= 0 && currentIndex < links.length - 1 ? links[currentIndex + 1] : null;
  const close = links.find((link) => link.id === "close") ?? null;
  const canSave = !["close", "orders", "deliveries"].includes(current);

  useEffect(() => {
    document.querySelectorAll<HTMLElement>("[data-class-primary-form]").forEach((marker) => {
      const form = marker.closest("form");
      const section = marker.dataset.classPrimaryForm;
      if (form && section) form.dataset.classPrimaryForm = section;
    });
    setHasActivePrimaryForm(Boolean(findActiveForm(current)));
    const markDirty = (event: Event) => {
      const target = event.target as HTMLElement | null;
      const form = target?.closest("form") as HTMLFormElement | null;
      if (!form || (!form.dataset.classPrimaryForm && !form.querySelector('[data-class-primary-form]') && !form.querySelector('input[name="returnTo"]'))) return;
      form.dataset.classDirty = "true";
    };
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!findDirtyForms().length) return;
      event.preventDefault();
      event.returnValue = "";
    };
    document.addEventListener("input", markDirty);
    document.addEventListener("change", markDirty);
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => {
      document.removeEventListener("input", markDirty);
      document.removeEventListener("change", markDirty);
      window.removeEventListener("beforeunload", warnBeforeUnload);
    };
  }, [current]);

  function openDestination(event: MouseEvent<HTMLAnchorElement>, href: string) {
    const forms = findDirtyForms();
    if (!forms.length) return;
    event.preventDefault();
    setDestination(href);
    setDirtyForms(forms);
    dialogRef.current?.showModal();
  }

  function saveCurrent() {
    const activeForm = dirtyForms[0];
    if (!activeForm) return;
    dialogRef.current?.close();
    submitPrimaryForm(activeForm);
  }

  function discardAndContinue() {
    dirtyForms.forEach((form) => { form.dataset.classDirty = "false"; });
    dialogRef.current?.close();
    window.location.assign(destination);
  }

  function reviewChanges() {
    dialogRef.current?.close();
    const first = dirtyForms[0];
    first?.scrollIntoView({ behavior: "smooth", block: "center" });
    first?.classList.add("class-form-needs-save");
    window.setTimeout(() => first?.classList.remove("class-form-needs-save"), 2400);
  }

  function submitCurrent() {
    const activeForm = findActiveForm(current);
    if (!activeForm) return;
    submitPrimaryForm(activeForm);
  }

  return (
    <>
      <nav className="class-section-nav" aria-label="Apartados de la clase">
        {links.map((link) => (
          <a
            className={link.id === current ? "current" : link.done ? "done" : ""}
            href={link.href}
            key={link.id}
            aria-current={link.id === current ? "page" : undefined}
            onClick={(event) => openDestination(event, link.href)}
          >
            {link.done ? <Check aria-hidden="true" size={15} /> : null}
            {link.label}
          </a>
        ))}
      </nav>
      <div className="class-context-actions" aria-label="Controles de la clase">
        {correctionLabel ? <span className="class-correction-state">{correctionLabel}</span> : null}
        {previous ? (
          <a className="class-context-secondary" href={previous.href} onClick={(event) => openDestination(event, previous.href)}>
            <ChevronLeft aria-hidden="true" size={18} />
            Anterior
          </a>
        ) : <span className="class-context-spacer" />}
        {canSave && hasActivePrimaryForm ? (
          <button className="class-context-save" type="button" onClick={submitCurrent}>
            <Save aria-hidden="true" size={18} />
            Guardar
          </button>
        ) : null}
        {next ? (
          <a className="class-context-secondary" href={next.href} onClick={(event) => openDestination(event, next.href)}>
            Siguiente
            <ChevronRight aria-hidden="true" size={18} />
          </a>
        ) : <span className="class-context-spacer" />}
        {close ? (
          <a className="class-context-close" href={close.href} onClick={(event) => openDestination(event, close.href)}>
            <LockKeyhole aria-hidden="true" size={17} />
            Cerrar clase
          </a>
        ) : null}
      </div>
      <dialog className="class-navigation-dialog" ref={dialogRef} aria-labelledby="class-navigation-dialog-title">
        <button className="dialog-close" type="button" aria-label="Cerrar" onClick={() => dialogRef.current?.close()}>
          <X aria-hidden="true" size={18} />
        </button>
        <h2 id="class-navigation-dialog-title">Cambios sin guardar</h2>
        {dirtyForms.length > 1 ? (
          <p>Hay varios bloques modificados. Guarda cada bloque antes de cambiar de apartado para no perder ninguno.</p>
        ) : (
          <p>Guarda los cambios actuales antes de abrir otro apartado.</p>
        )}
        <div className="class-navigation-dialog-actions">
          {dirtyForms.length === 1 ? (
            <button type="button" onClick={saveCurrent}>
              <Save aria-hidden="true" size={16} />
              Permanecer y guardar
            </button>
          ) : (
            <button type="button" onClick={reviewChanges}>Revisar cambios</button>
          )}
          <button className="secondary-button" type="button" onClick={discardAndContinue}>Salir sin guardar</button>
          <button className="secondary-button" type="button" onClick={() => dialogRef.current?.close()}>Cancelar</button>
        </div>
      </dialog>
    </>
  );
}

function findDirtyForms() {
  return Array.from(document.querySelectorAll<HTMLFormElement>('form[data-class-dirty="true"]'));
}

function findActiveForm(current: string) {
  const section = CSS.escape(current);
  const forms = Array.from(document.querySelectorAll<HTMLFormElement>(`form[data-class-primary-form="${section}"], form:has([data-class-primary-form="${section}"])`));
  return forms.length === 1 ? forms[0] : null;
}

function submitPrimaryForm(activeForm: HTMLFormElement) {
  if (!activeForm.checkValidity()) {
    activeForm.reportValidity();
    return;
  }
  activeForm.requestSubmit();
}
