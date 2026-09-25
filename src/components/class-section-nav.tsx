"use client";

import { Check, Save, X } from "lucide-react";
import { MouseEvent, useEffect, useRef, useState } from "react";

export type ClassSectionLink = {
  id: string;
  label: string;
  href: string;
  done?: boolean;
};

export function ClassSectionNav({ links, current }: { links: ClassSectionLink[]; current: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [destination, setDestination] = useState("");
  const [dirtyForms, setDirtyForms] = useState<HTMLFormElement[]>([]);

  useEffect(() => {
    const markDirty = (event: Event) => {
      const target = event.target as HTMLElement | null;
      const form = target?.closest("form") as HTMLFormElement | null;
      if (!form || !form.querySelector('input[name="returnTo"]')) return;
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
  }, []);

  function openDestination(event: MouseEvent<HTMLAnchorElement>, href: string) {
    const forms = findDirtyForms();
    if (!forms.length) return;
    event.preventDefault();
    setDestination(href);
    setDirtyForms(forms);
    dialogRef.current?.showModal();
  }

  function saveAndContinue() {
    const form = dirtyForms[0];
    if (!form || !destination) return;
    const returnTo = form.querySelector('input[name="returnTo"]') as HTMLInputElement | null;
    if (!returnTo) return;
    returnTo.value = destination;
    form.dataset.classDirty = "false";
    dialogRef.current?.close();
    form.requestSubmit();
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
      <dialog className="class-navigation-dialog" ref={dialogRef}>
        <button className="dialog-close" type="button" aria-label="Cerrar" onClick={() => dialogRef.current?.close()}>
          <X aria-hidden="true" size={18} />
        </button>
        <h2>Cambios sin guardar</h2>
        {dirtyForms.length > 1 ? (
          <p>Hay varios bloques modificados. Guarda cada bloque antes de cambiar de apartado para no perder ninguno.</p>
        ) : (
          <p>Guarda los cambios actuales antes de abrir otro apartado.</p>
        )}
        <div className="class-navigation-dialog-actions">
          {dirtyForms.length === 1 ? (
            <button type="button" onClick={saveAndContinue}>
              <Save aria-hidden="true" size={16} />
              Guardar y continuar
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
