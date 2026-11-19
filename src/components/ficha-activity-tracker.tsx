"use client";
import { useEffect } from "react";
import { activeElapsedSeconds, fichaSections, sectionFromTitle, type FichaActivityEvent, type FichaSection } from "@/lib/ficha-activity";

export function FichaActivityTracker({ token, defaultSection = "overview" }: { token: string; defaultSection?: FichaSection }) {
  useEffect(() => {
    let sessionId = crypto.randomUUID();
    const storageKey = `skbc-ficha-activity:${token}`;
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
      if (saved && /^[0-9a-f-]{36}$/i.test(saved.id) && Date.now() - saved.lastSeen < 30 * 60_000) sessionId = saved.id;
    } catch { /* Storage may be unavailable in private browsing. */ }
    let queue: FichaActivityEvent[] = [], ready = false, inFlight = false, stopped = false;
    let lastInput = Date.now(), lastTick = Date.now(), section: FichaSection = defaultSection;
    const seconds = new Map<FichaSection, number>();
    const seenTechniques = new Set<string>();
    let focusedTechnique = "", techniqueSince = 0;
    const remember = () => { try { sessionStorage.setItem(storageKey, JSON.stringify({ id: sessionId, lastSeen: Date.now() })); } catch { /* Optional persistence. */ } };
    const event = (value: Omit<FichaActivityEvent, "id">) => {
      queue.push({ id: crypto.randomUUID(), ...value, ...(value.label ? { label: value.label.replace(/[\u0000-\u001f]/g, " ").slice(0, 180) } : {}) });
      if (queue.length > 60) queue = queue.slice(-60);
    };
    const emitTime = () => {
      for (const [key, value] of seconds) {
        let whole = Math.floor(value);
        while (whole > 0) { const amount = Math.min(15, whole); event({ kind: "time", section: key, seconds: amount }); whole -= amount; }
        seconds.set(key, value - Math.floor(value));
      }
    };
    const flush = async (beacon = false) => {
      emitTime();
      if (!queue.length || stopped) return;
      remember();
      const batch = queue.slice(0, 20);
      const body = JSON.stringify({ token, sessionId, events: batch });
      if (beacon && navigator.sendBeacon) {
        navigator.sendBeacon("/api/ficha/activity", new Blob([body], { type: "application/json" }));
        return;
      }
      if (inFlight) return;
      inFlight = true;
      try {
        const result = await fetch("/api/ficha/activity", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true });
        if (result.ok || result.status === 400 || result.status === 413) {
          const sent = new Set(batch.map(row => row.id));
          queue = queue.filter(row => !sent.has(row.id));
          if (result.ok) ready = true;
        }
      } catch { /* Retry the same event IDs; telemetry never interrupts the ficha. */ }
      finally { inFlight = false; }
    };
    function identifySection(element: Element | null): FichaSection {
      const explicit = element?.closest<HTMLElement>("[data-ficha-section]")?.dataset.fichaSection;
      if (explicit && Object.hasOwn(fichaSections, explicit)) return explicit as FichaSection;
      if (element?.closest(".class-photo-history")) return "gallery";
      const block = element?.closest("section, details");
      const heading = block?.querySelector("h2, summary strong, h3");
      const mapped = heading ? sectionFromTitle(heading.textContent ?? "") : defaultSection;
      return mapped === "overview" ? defaultSection : mapped;
    }
    function resource(element: Element | null) {
      const item = element?.closest<HTMLElement>("[data-ficha-technique]") ?? element?.closest("tr")?.querySelector<HTMLElement>("[data-ficha-technique]");
      return item ? { id: item.dataset.fichaTechnique ?? "", label: (item.dataset.fichaLabel ?? "Técnica").slice(0, 180) } : null;
    }
    const tick = () => {
      const now = Date.now();
      const active = activeElapsedSeconds(lastTick, now, lastInput, document.visibilityState === "visible", document.hasFocus());
      lastTick = now;
      if (!active || !ready) { focusedTechnique = ""; return; }
      const point = document.elementFromPoint(window.innerWidth / 2, Math.min(window.innerHeight * .4, 300));
      const next = identifySection(point);
      if (next !== section) { section = next; event({ kind: "section", section, seconds: 0 }); }
      seconds.set(section, (seconds.get(section) ?? 0) + active);
      const item = resource(point);
      const key = item ? `${item.id}:${item.label}` : "";
      if (!key) { focusedTechnique = ""; return; }
      if (key !== focusedTechnique) { focusedTechnique = key; techniqueSince = now; }
      else if (now - techniqueSince >= 3000 && !seenTechniques.has(key)) {
        seenTechniques.add(key);
        event({ kind: "technique", section, seconds: 0, resourceId: item!.id || undefined, label: item!.label });
      }
    };
    const interact = () => { lastInput = Date.now(); };
    const click = (value: MouseEvent) => {
      interact();
      const target = value.target instanceof Element ? value.target : null;
      const video = target?.closest<HTMLElement>("[data-ficha-video]");
      if (!video) return;
      const item = resource(video);
      event({ kind: "video", section: identifySection(video), seconds: 0,
        ...(item?.id ? { resourceId: item.id } : {}), label: (video.dataset.fichaVideo || item?.label || "Vídeo").slice(0, 180) });
      void flush();
    };
    const toggle = (value: Event) => {
      const detail = value.target;
      if (detail instanceof HTMLDetailsElement && detail.open) {
        interact(); event({ kind: "section", section: identifySection(detail), seconds: 0 });
      }
    };
    const visibility = () => { lastTick = Date.now(); if (document.hidden) void flush(true); else interact(); };
    const hide = () => { void flush(true); };
    const focus = () => { interact(); lastTick = Date.now(); };
    event({ kind: "section", section: defaultSection, seconds: 0 });
    void flush();
    const clock = window.setInterval(tick, 1000);
    const sender = window.setInterval(() => { void flush(); }, 15_000);
    const options = { passive: true };
    window.addEventListener("pointerdown", interact, options);
    window.addEventListener("wheel", interact, options); window.addEventListener("touchmove", interact, options);
    window.addEventListener("keydown", interact, options);
    window.addEventListener("scroll", interact, options);
    window.addEventListener("focus", focus);
    window.addEventListener("pagehide", hide);
    document.addEventListener("visibilitychange", visibility);
    document.addEventListener("click", click, true);
    document.addEventListener("toggle", toggle, true);
    return () => {
      void flush(true); stopped = true;
      clearInterval(clock); clearInterval(sender);
      window.removeEventListener("wheel", interact); window.removeEventListener("touchmove", interact);
      window.removeEventListener("pointerdown", interact); window.removeEventListener("keydown", interact); window.removeEventListener("scroll", interact);
      window.removeEventListener("focus", focus); window.removeEventListener("pagehide", hide);
      document.removeEventListener("visibilitychange", visibility); document.removeEventListener("click", click, true); document.removeEventListener("toggle", toggle, true);
    };
  }, [token, defaultSection]);
  return null;
}
