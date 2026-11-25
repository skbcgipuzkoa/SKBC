"use client";

import { useRef, useState, type FormEvent } from "react";
import { euros } from "@/lib/shop/promotion";
import { StoreGrid, type StoreProduct } from "./catalog";
import { submitMaterialOrder } from "./actions";
import styles from "./store.module.css";

type Line = { key: string; variant_id: string; product: string; label: string; recipient: string; quantity: number; price: number };

export function MaterialStore({ products }: { products: StoreProduct[] }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [receipt, setReceipt] = useState<{ reference: string; total: number }>();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const attempt = useRef<{ fingerprint: string; id: string } | undefined>(undefined);

  async function checkout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lines.length || pending) return;
    const form = new FormData(event.currentTarget);
    const data = {
      name: String(form.get("name") ?? "").trim(), email: String(form.get("email") ?? "").trim().toLowerCase(),
      phone: String(form.get("phone") ?? "").trim(), member: String(form.get("member") ?? "").trim(),
      notes: String(form.get("notes") ?? "").trim(), consent: form.get("consent") === "on",
      items: lines.map(({ variant_id, recipient, quantity }) => ({ variant_id, recipient, quantity }))
    };
    const fingerprint = JSON.stringify({ ...data, items: data.items.map(item => JSON.stringify(item)).sort() });
    if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, id: crypto.randomUUID() };
    setPending(true);
    setError("");
    try {
      const result = await submitMaterialOrder({ ...data, id: attempt.current.id });
      if ("error" in result) setError(result.error);
      else {
        setReceipt(result);
        setLines([]);
        attempt.current = undefined;
      }
    } catch {
      setError("No se ha podido comprobar si el pedido se guardó. Puedes reintentar desde aquí.");
    } finally {
      setPending(false);
    }
  }

  return <>
    <StoreGrid products={products} recipient add={(product, option, quantity, recipient) => {
      if (pending || lines.length >= 30) return false;
      setReceipt(undefined);
      setLines(current => [...current, { key: crypto.randomUUID(), variant_id: option.id,
        product: product.name, label: option.label, recipient, quantity, price: option.price }]);
      return true;
    }} />
    {receipt || lines.length ? <section id="pedido-material" className={styles.checkout}>
      {receipt ? <>
        <h2>Pedido de material recibido</h2>
        <p>Referencia {receipt.reference} · Total {euros.format(receipt.total / 100)}</p>
      </> : <>
        <h2>Tu pedido de material</h2>
        <ul>{lines.map(line => <li key={line.key}>{line.quantity} × {line.product} · {line.label} · {line.recipient} — {euros.format(line.price * line.quantity / 100)}{" "}
          <button type="button" disabled={pending} onClick={() => setLines(current => current.filter(item => item.key !== line.key))}>Quitar</button></li>)}</ul>
        <strong>Total estimado {euros.format(lines.reduce((sum, line) => sum + line.quantity * line.price, 0) / 100)}</strong>
        <form onSubmit={checkout} data-no-global-feedback="true">
          <label>Nombre y apellidos<input name="name" required minLength={2} maxLength={160} autoComplete="name" /></label>
          <label>Correo electrónico<input name="email" type="email" required maxLength={160} autoComplete="email" /></label>
          <label>Teléfono<input name="phone" type="tel" required minLength={6} maxLength={25} autoComplete="tel" /></label>
          <label>Número de socio (opcional)<input name="member" maxLength={120} /></label>
          <label>Observaciones (opcional)<textarea name="notes" maxLength={1000} /></label>
          <label className={styles.consent}><input name="consent" type="checkbox" required /> Acepto el uso de estos datos para gestionar mi pedido.</label>
          <p>El club confirmará la disponibilidad y el pago.</p>
          {error ? <p role="alert">{error}</p> : null}
          <button className={styles.add} disabled={pending}>{pending ? "Enviando…" : "Confirmar pedido de material"}</button>
        </form>
      </>}
    </section> : null}
  </>;
}
