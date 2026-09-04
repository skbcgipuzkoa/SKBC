"use client";

import { useEffect, useRef, useState } from "react";

const FEEDBACK_DURATION = 4500;

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
      }, FEEDBACK_DURATION);
    };

    const onSubmit = (event: SubmitEvent) => {
      const form = event.target instanceof HTMLFormElement ? event.target : null;
      if (!form || form.dataset.noGlobalFeedback === "true") return;
      const submitter = event.submitter instanceof HTMLElement ? event.submitter : form.querySelector<HTMLElement>("button[type='submit']");
      markElement(submitter);
      showFeedback(submitter?.textContent?.toLowerCase().includes("eliminar") ? "Procesando accion..." : "Guardando...");
    };

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
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
