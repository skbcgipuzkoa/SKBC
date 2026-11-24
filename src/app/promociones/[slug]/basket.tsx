"use client";

import { useState, type FormEvent } from "react";
import { euros, type PromotionVariant } from "@/lib/shop/promotion";
import { promotionQuote, submitPromotion } from "../actions";
import styles from "./promotion.module.css";

const messages = {
  none: "",
  applied: "Código aplicado.",
  expired: "La promoción ha terminado. Se aplican los precios originales.",
  invalid: "El código no es válido para esta promoción."
};

type Attempt = { id: string; slug: string; code: string; selection: { id: string; quantity: number }[]; revision: string; offerRevision: string | null; status: string; total: number; customer: string; contact: string; notes: string };

export function PromotionBasket({ slug, variants, initialRevision }: { slug: string; initialRevision: string; variants: Omit<PromotionVariant, "offer">[] }) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [code, setCode] = useState("");
  const [quote, setQuote] = useState<Awaited<ReturnType<typeof promotionQuote>>>();
  const [revision, setRevision] = useState(initialRevision);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState("");
  const [attempt, setAttempt] = useState<Attempt>();
  const selection = variants.flatMap(({ id }) => quantities[id] > 0 ? [{ id, quantity: quantities[id] }] : []);
  const groups = new Map<string, typeof variants>();
  for (const variant of variants) {
    const group = groups.get(variant.product);
    if (group) group.push(variant);
    else groups.set(variant.product, [variant]);
  }
  const currentTotal = variants.reduce((total, variant) => total + (quantities[variant.id] ?? 0) *
    (quote?.lines.find(line => line.id === variant.id)?.price ?? variant.original), 0);

  async function apply() {
    setBusy(true);
    setError("");
    try {
      const result = await promotionQuote({ slug, code });
      setQuote(result);
      setRevision(result.revision);
    } catch {
      setError("No se pudo comprobar el código. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  async function checkout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      if (attempt) {
        await send(attempt);
        return;
      }
      const latest = await promotionQuote({ slug, code });
      setQuote(latest);
      setRevision(latest.revision);
      if ((quote && (quote.status !== latest.status || quote.offerRevision !== latest.offerRevision)) || (revision && revision !== latest.revision) || (!quote && code.trim())) {
        setError("Revisa el total actualizado y confirma de nuevo.");
        return;
      }
      if (latest.status === "invalid") return;
      const body = {
        slug, code, selection, revision: latest.revision, offerRevision: latest.offerRevision, status: latest.status, total: currentTotal,
        customer: String(fields.get("customer")), contact: String(fields.get("contact")), notes: String(fields.get("notes"))
      };
      await send({ ...body, id: crypto.randomUUID() });
    } catch {
      setError("No se ha podido verificar la confirmación. Puedes reintentarlo.");
    } finally {
      setBusy(false);
    }
  }

  async function send(body: Attempt) {
    setAttempt(body);
    const result = await submitPromotion(body);
    setAttempt(undefined);
    if (result === "saved") setReceipt(body.id);
    else if (result === "changed") setError("El precio o la disponibilidad ha cambiado. Revisa tu pedido e inténtalo de nuevo.");
    else setError("No se pudo confirmar el pedido. Comprueba los datos e inténtalo de nuevo.");
  }

  if (receipt) return <section className={styles.card} role="status"><h2>Pedido recibido</h2><p>Referencia {receipt}</p></section>;

  return <form className={styles.stack} onSubmit={checkout}>
    <fieldset disabled={busy || !!attempt} className={styles.stack}>
      <div className={styles.grid}>
        {[...groups].map(([product, options]) => <section className={styles.card} key={product}>
          {options[0].image ? <img className={styles.photo} src={options[0].image} alt={product} loading="lazy" /> : null}
          <h2>{product}</h2>
          {options.map(({ id, variant, original, image }) => {
            const price = quote?.lines.find(line => line.id === id)?.price ?? original;
            return <div className={styles.line} key={id}>
              <label htmlFor={id}>{image && image !== options[0].image ? <img src={image} width={64} height={64} alt="" loading="lazy" /> : null}{variant}<span className={styles.price}>{price < original ? <del>{euros.format(original / 100)}</del> : null} {euros.format(price / 100)}</span></label>
              <input id={id} aria-label={"Cantidad de " + product + " " + variant} type="number" min={0} max={2147483647} step={1} value={quantities[id] ?? 0} onChange={event =>
                setQuantities({ ...quantities, [id]: Number(event.target.value) })
              } />
            </div>;
          })}
        </section>)}
      </div>
      <section className={styles.card}>
        <h2>Tu pedido</h2>
        <label>Código de descuento<input value={code} maxLength={50} onChange={event => {
          setCode(event.target.value);
          setQuote(undefined);
        }} /></label>
        <button type="button" onClick={apply}>Aplicar código</button>
        <p role="status">{quote ? messages[quote.status] : ""}</p>
        <ul>{selection.map(({ id, quantity }) => {
          const item = variants.find(variant => variant.id === id)!;
          const price = quote?.lines.find(line => line.id === id)?.price ?? item.original;
          return <li key={id}>{quantity} × {item.product} · {item.variant} — {euros.format(quantity * price / 100)}</li>;
        })}</ul>
        <p className={styles.total}>Total {euros.format(currentTotal / 100)}</p>
        <label>Nombre para el pedido<input name="customer" required minLength={2} maxLength={160} autoComplete="name" /></label>
        <label>Teléfono o correo de contacto<input name="contact" required minLength={5} maxLength={160} /></label>
        <label>Observaciones<textarea name="notes" maxLength={1000} /></label>
        {error ? <p role="alert">{error}</p> : null}
        <button disabled={!selection.length || quote?.status === "invalid"}>Confirmar pedido</button>
      </section>
    </fieldset>
    {attempt && !busy ? <button type="submit">Comprobar o reintentar el envío</button> : null}
  </form>;
}
