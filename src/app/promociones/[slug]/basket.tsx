"use client";

import { useState, type FormEvent } from "react";
import { euros, generalShopSlug, type PromotionVariant } from "@/lib/shop/promotion";
import { promotionQuote, submitPromotion } from "../actions";
import { PromotionPhoto } from "./photo";
import styles from "./promotion.module.css";

const messages = {
  none: "",
  applied: "Código aplicado.",
  expired: "La promoción ha terminado. Se aplican los precios originales.",
  invalid: "El código no es válido para esta promoción."
};

type Attempt = { id: string; slug: string; code: string; selection: { id: string; quantity: number }[]; revision: string; offerRevision: string | null; status: string; total: number; customer: string; contact: string; notes: string };

type PaymentDetails = { deadline: string; bizumPhone: string };

export function PromotionBasket({ slug, variants, initialRevision, payment }: { slug: string; initialRevision: string; payment?: PaymentDetails; variants: (Omit<PromotionVariant, "offer"> & { advertisedOffer?: number })[] }) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [code, setCode] = useState("");
  const [quote, setQuote] = useState<Awaited<ReturnType<typeof promotionQuote>>>();
  const [revision, setRevision] = useState(initialRevision);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<{ id: string; total: number; payment?: PaymentDetails }>();
  const [attempt, setAttempt] = useState<Attempt>();
  const selection = variants.flatMap(({ id }) => quantities[id] > 0 ? [{ id, quantity: quantities[id] }] : []);
  const selectedIds = new Set(selection.map(line => line.id));
  const restricted = slug !== generalShopSlug || (quote?.status === "applied" && quote.lines.some(line => line.eligible && selectedIds.has(line.id)));
  const paymentNotice = restricted ? (quote ? quote.payment : payment) : undefined;
  const groups = new Map<string, typeof variants>();
  const quotedPrices = new Map(quote?.lines.map(line => [line.id, line]));
  for (const variant of variants) {
    const livePrice = quotedPrices.get(variant.id);
    const display = livePrice ? { ...variant, original: livePrice.original, advertisedOffer: livePrice.advertisedOffer } : variant;
    const group = groups.get(variant.product);
    if (group) group.push(display);
    else groups.set(variant.product, [display]);
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
        await send(attempt, paymentNotice);
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
        customer: String(fields.get("customer") ?? ""), contact: String(fields.get("contact") ?? ""), notes: String(fields.get("notes") ?? "")
      };
      await send({ ...body, id: crypto.randomUUID() }, restricted ? latest.payment : undefined);
    } catch {
      setError("No se ha podido verificar la confirmación. Puedes reintentarlo.");
    } finally {
      setBusy(false);
    }
  }

  async function send(body: Attempt, instructions: PaymentDetails | undefined) {
    setAttempt(body);
    const result = await submitPromotion(body);
    setAttempt(undefined);
    if (result === "saved") setReceipt({ id: body.id, total: body.total, payment: instructions });
    else if (result === "limit") setError("Este alumno tiene un máximo de 5 prendas al precio promocional, contando sus pedidos anteriores. Reduce la cantidad.");
    else if (result === "member") setError("Comprueba que el nombre y los apellidos coincidan con tu inscripción en el club.");
    else if (result === "changed") setError("El precio o la disponibilidad ha cambiado. Revisa tu pedido e inténtalo de nuevo.");
    else setError("No se pudo confirmar el pedido. Comprueba los datos e inténtalo de nuevo.");
  }

  if (receipt) return <section className={styles.card} role="status">
    <h2>Pedido recibido</h2>
    <p>Referencia {receipt.id}</p>
    {receipt.payment ? <>
      <p className={styles.total}>Importe a pagar {euros.format(receipt.total / 100)}</p>
      <PaymentNotice payment={receipt.payment} />
    </> : null}
  </section>;

  return <form className={styles.stack} onSubmit={checkout}>
    <fieldset disabled={busy || !!attempt} className={styles.stack}>
      {restricted ? <section className={styles.card}>
        <h2>¿A nombre de quién es el pedido?</h2>
        <label>Nombre y apellidos del alumno
          <input name="customer" required minLength={2} maxLength={160} autoComplete="name" />
        </label>
        <p>Máximo 5 prendas al precio promocional por alumno inscrito, sumando sus pedidos de esta promoción.</p>
      </section> : null}
      <div className={styles.grid}>
        {[...groups].map(([product, options]) => {
          const first = options[0];
          const uniform = options.every(option => option.original === first.original && option.advertisedOffer === first.advertisedOffer);
          const cover = options.find(option => option.image)?.image;
          return <section className={styles.card} key={product}>
            <h2>{product}</h2>
            {uniform ? <ProductPrice original={first.original} offer={first.advertisedOffer} /> : null}
            {cover ? <PromotionPhoto className={styles.photo} src={cover} alt={product} /> : null}
            {options.map(({ id, variant, original, image, advertisedOffer }) => {
              return <div className={styles.line} key={id}>
                <label htmlFor={id}>
                  {image && image !== cover ? <PromotionPhoto src={image} alt="" thumbnail /> : null}
                  {variant}
                  {!uniform ? <ProductPrice original={original} offer={advertisedOffer} /> : null}
                </label>
                <input id={id} aria-label={"Cantidad de " + product + " " + variant} type="number" min={0} max={2147483647} step={1} value={quantities[id] ?? 0} onChange={event =>
                  setQuantities({ ...quantities, [id]: Number(event.target.value) })
                } />
              </div>;
            })}
          </section>;
        })}
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
        {!restricted ? <>
          <label>Nombre para el pedido<input name="customer" required minLength={2} maxLength={160} autoComplete="name" /></label>
          <label>Teléfono o correo de contacto<input name="contact" required minLength={5} maxLength={160} /></label>
        </> : null}
        <label>Observaciones<textarea name="notes" maxLength={1000} /></label>
        {error ? <p role="alert">{error}</p> : null}
        {paymentNotice ? <PaymentNotice payment={paymentNotice} /> : null}
        <button disabled={!selection.length || quote?.status === "invalid"}>Confirmar pedido</button>
      </section>
    </fieldset>
    {attempt && !busy ? <button type="submit">Comprobar o reintentar el envío</button> : null}
  </form>;
}

function ProductPrice({ original, offer }: { original: number; offer?: number }) {
  return <span className={styles.pricePair}>
    <span>PVP <strong>{euros.format(original / 100)}</strong></span>
    {offer !== undefined ? <span className={styles.offerPrice}>Con código <strong>{euros.format(offer / 100)}</strong></span> : null}
  </span>;
}

function PaymentNotice({ payment }: { payment: PaymentDetails }) {
  return <aside className={styles.paymentNotice} aria-label="Información de pago">
    <p><strong>El pedido quedará formalizado cuando se realice el pago.</strong></p>
    <p>Puedes pagar {payment.bizumPhone ? <>por Bizum al <strong>{payment.bizumPhone}</strong> o</> : null} en persona.</p>
    <p>El último día para pagar es el <strong>{payment.deadline}</strong> (hora peninsular).</p>
  </aside>;
}
