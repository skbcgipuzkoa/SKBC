"use client";

import { useEffect, useRef, useState } from "react";

const FEEDBACK_DURATION = 4500;
const PRESS_DURATION = 900;

function normalizeLabel(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getActionMessage(element: HTMLElement | null, fallback = "Procesando...") {
  const label = normalizeLabel(
    [
      element?.dataset.feedbackMessage,
      element?.getAttribute("aria-label"),
      element?.textContent,
      element?.getAttribute("title"),
    ]
      .filter(Boolean)
      .join(" "),
  );

  if (!label) return fallback;
  if (/(guardar|actualizar|registrar|anadir|añadir|crear|cerrar|confirmar|enviar|reintentar|pausar|activar|desactivar)/.test(label)) {
    return "Guardando...";
  }
  if (/(preparar|generar|calcular|duplicar|importar|exportar|sincronizar|backup|copia)/.test(label)) {
    return "Preparando...";
  }
  if (/(pdf|imprimir|descargar|compartir|diploma|informe)/.test(label)) {
    return "Preparando documento...";
  }
  if (/(eliminar|borrar|quitar)/.test(label)) {
    return "Eliminando...";
  }
  if (/(abrir|ver|volver|entrar|accesos|ficha|detalle|consulta|app examenes|inicio)/.test(label)) {
    return "Abriendo...";
  }
  return fallback;
}

function isIgnoredControl(element: HTMLElement) {
  if (element.dataset.noGlobalFeedback === "true") return true;
  if (element.closest("[data-no-global-feedback='true']")) return true;
  if (element instanceof HTMLButtonElement) {
    return element.disabled || element.type === "reset";
  }
  if (element instanceof HTMLInputElement) {
    return element.disabled || !["button", "submit"].includes(element.type);
  }
  return false;
}

export function InteractionFeedback() {
  const [message, setMessage] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const showFeedback = (nextMessage: string) => {
      setMessage(nextMessage);
      document.documentElement.classList.add("is-interacting");
      if ("vibrate" in navigator) {
        navigator.vibrate?.(12);
      }
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setMessage("");
        document.documentElement.classList.remove("is-interacting");
      }, FEEDBACK_DURATION);
    };

    const markElement = (element: HTMLElement | null) => {
      if (!element) return;
      element.classList.add("is-pressed-action");
      element.setAttribute("aria-busy", "true");
      setTimeout(() => {
        element.classList.remove("is-pressed-action");
        element.removeAttribute("aria-busy");
      }, PRESS_DURATION);
    };

    const onSubmit = (event: SubmitEvent) => {
      const form = event.target instanceof HTMLFormElement ? event.target : null;
      if (!form || form.dataset.noGlobalFeedback === "true") return;
      const submitter = event.submitter instanceof HTMLElement ? event.submitter : form.querySelector<HTMLElement>("button[type='submit']");
      if (submitter && isIgnoredControl(submitter)) return;
      markElement(submitter);
      showFeedback(getActionMessage(submitter, "Guardando..."));
    };

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      const action = target?.closest<HTMLElement>("button, input[type='button'], input[type='submit'], [role='button']");
      if (action && !isIgnoredControl(action)) {
        const isSubmitter =
          (action instanceof HTMLButtonElement && action.type === "submit") ||
          (action instanceof HTMLInputElement && action.type === "submit");
        if (!isSubmitter) {
          markElement(action);
          showFeedback(getActionMessage(action));
        }
      }

      const link = target?.closest<HTMLAnchorElement>("a[href]");
      if (!link || link.dataset.noGlobalFeedback === "true") return;
      if (link.target && link.target !== "_self") return;
      const href = link.getAttribute("href") ?? "";
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) return;
      markElement(link);
      showFeedback("Abriendo...");
    };

    const onPageShow = () => {
      setMessage("");
      document.documentElement.classList.remove("is-interacting");
    };

    document.addEventListener("submit", onSubmit, true);
    document.addEventListener("click", onClick, true);
    window.addEventListener("pageshow", onPageShow);

    return () => {
      document.removeEventListener("submit", onSubmit, true);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("pageshow", onPageShow);
      if (timerRef.current) clearTimeout(timerRef.current);
      document.documentElement.classList.remove("is-interacting");
    };
  }, []);

  return (
    <div className={message ? "interaction-feedback visible" : "interaction-feedback"} role="status" aria-live="polite">
      <span className="interaction-spinner" aria-hidden="true" />
      <strong>{message}</strong>
    </div>
  );
}
