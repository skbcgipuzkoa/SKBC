"use client";

import { useMemo, useState } from "react";

type ReviewMember = {
  id: string;
  display_name: string;
  class: "kids" | "adults";
  grade: string | null;
  joined_on: string | null;
};

export function SeasonReviewSelector({ members }: { members: ReviewMember[] }) {
  const now = new Date();
  const [from, setFrom] = useState(`${now.getFullYear()}-01-01`);
  const [to, setTo] = useState(now.toISOString().slice(0, 10));
  const [selected, setSelected] = useState<string[]>([]);
  const kids = useMemo(() => members.filter((member) => member.class === "kids"), [members]);
  const adults = useMemo(() => members.filter((member) => member.class === "adults"), [members]);

  function toggle(id: string, checked: boolean) {
    setSelected((current) => checked ? Array.from(new Set([...current, id])) : current.filter((item) => item !== id));
  }

  function toggleGroup(group: ReviewMember[], checked: boolean) {
    const ids = group.map((member) => member.id);
    setSelected((current) => checked ? Array.from(new Set([...current, ...ids])) : current.filter((item) => !ids.includes(item)));
  }

  function openSelected() {
    window.open(batchReviewUrl(selected, from, to), "_blank", "noopener,noreferrer");
  }

  return (
    <section className="card season-review-card">
      <div className="section-heading-row">
        <div>
          <p className="eyebrow">Navidad / fin de temporada</p>
          <h2>Review personal para alumnos</h2>
          <p className="muted">Genera un PDF motivador con entrenos, tecnicas, cursos y examenes del periodo elegido.</p>
        </div>
        <span className="state-badge state-completada">{selected.length} seleccionados</span>
      </div>

      <div className="season-review-dates">
        <label>
          Desde
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label>
          Hasta
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
      </div>

      <ReviewGroup title="Ninos" members={kids} selected={selected} from={from} to={to} onToggle={toggle} onToggleAll={toggleGroup} />
      <ReviewGroup title="Adultos" members={adults} selected={selected} from={from} to={to} onToggle={toggle} onToggleAll={toggleGroup} />

      <div className="form-actions">
        <button type="button" disabled={!selected.length} onClick={openSelected}>
          Abrir PDF conjunto
        </button>
        <p className="muted">Si marcas varios kenshis, se genera un unico PDF con todos los informes, uno detras de otro.</p>
      </div>
    </section>
  );
}

function ReviewGroup({
  title,
  members,
  selected,
  from,
  to,
  onToggle,
  onToggleAll
}: {
  title: string;
  members: ReviewMember[];
  selected: string[];
  from: string;
  to: string;
  onToggle: (id: string, checked: boolean) => void;
  onToggleAll: (members: ReviewMember[], checked: boolean) => void;
}) {
  const selectedCount = members.filter((member) => selected.includes(member.id)).length;
  return (
    <details className="season-review-group">
      <summary>
        <strong>{title}</strong>
        <span>{selectedCount}/{members.length}</span>
      </summary>
      <label className="check-row review-check-all">
        <input type="checkbox" checked={members.length > 0 && selectedCount === members.length} onChange={(event) => onToggleAll(members, event.target.checked)} />
        <span><strong>Marcar todos</strong><small>{title}</small></span>
      </label>
      <div className="season-review-member-grid">
        {members.map((member) => (
          <label className="check-row" key={member.id}>
            <input type="checkbox" checked={selected.includes(member.id)} onChange={(event) => onToggle(member.id, event.target.checked)} />
            <span>
              <strong>{member.display_name}</strong>
              <small>{member.grade ?? "Sin grado"}{member.joined_on ? ` · desde ${formatDate(member.joined_on)}` : ""}</small>
            </span>
            <a className="secondary-button" href={reviewUrl(member.id, from, to)} target="_blank" rel="noreferrer">PDF</a>
          </label>
        ))}
      </div>
    </details>
  );
}

function reviewUrl(id: string, from: string, to: string) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  return `/avisos/review/${id}?${params.toString()}`;
}

function batchReviewUrl(ids: string[], from: string, to: string) {
  const params = new URLSearchParams();
  if (ids.length) params.set("ids", ids.join(","));
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  return `/avisos/review-lote?${params.toString()}`;
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
