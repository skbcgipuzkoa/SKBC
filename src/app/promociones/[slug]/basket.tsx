"use client";

import { Minus, Plus, Tag } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { euros, generalShopSlug, type PromotionVariant } from "@/lib/shop/promotion";
import { promotionQuote, submitPromotion } from "../actions";
import { plannedPaymentLabels } from "@/lib/shop/order-management";
import { PromotionPhoto } from "./photo";
import { StoreGrid, useStoreCategory, type StoreProduct } from "../../tienda/catalog";
import styles from "./promotion.module.css";

const messages = {
  none: "",
  applied: "Código aplicado. El descuento se aplica a los productos de la promoción.",
  expired: "La promoción ha terminado. Se aplican los precios originales.",
  invalid: "El código no es válido para esta promoción."
};

type Attempt = { id: string; slug: string; code: string; selection: { id: string; quantity: number }[]; revision: string; offerRevision: string | null; status: string; total: number; customer: string; contact: string; notes: string; paymentMethod?: string };

type PaymentDetails = { deadline: string; bizumPhone: string };

export function PromotionBasket({ slug, variants, initialRevision, payment, cover, storefront }: { slug: string; initialRevision: string; payment?: PaymentDetails; cover?: ReactNode; storefront?: StoreProduct[]; variants: (Omit<PromotionVariant, "offer"> & { advertisedOffer?: number })[] }) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [quote, setQuote] = useState<Awaited<ReturnType<typeof promotionQuote>>>();
  const [revision, setRevision] = useState(initialRevision);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const checkoutFeedback = useRef<HTMLElement | null>(null);
  const [receipt, setReceipt] = useState<{ id: string; total: number; payment?: PaymentDetails }>();
  const [attempt, setAttempt] = useState<Attempt>();
  const selection = variants.flatMap(({ id }) => quantities[id] > 0 ? [{ id, quantity: quantities[id] }] : []);
  const category = useStoreCategory();
  const showStorefront = !storefront || category === "all" || storefront.some(product => product.section === category) || selection.length > 0;
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

  useEffect(() => {
    if (error || receipt) checkoutFeedback.current?.focus();
  }, [error, receipt]);

  function setQuantity(id: string, quantity: number) {
    setQuantities(current => ({ ...current, [id]: Math.max(0, Math.min(2147483647, quantity)) }));
    setError("");
  }

  async function apply()
 {
    setBusy(true);
    setCodeError("");
    setError("");
    try {
      const result = await promotionQuote({ slug, code });
      setQuote(result);
      setRevision(result.revision);
    } catch {
      setCodeError("No se pudo comprobar el código. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  async function checkout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setSubmitting(true);
    setError("");
    try {
      if (attempt) {
        await send(attempt, paymentNotice);
        return;
      }
      const latest = await promotionQuote({ slug, code });
      setQuote(latest);
      setRevision(latest.revision);
      if (latest.status === "invalid") {
        setError("El código promocional no es válido. Revísalo antes de confirmar.");
        return;
      }
      if ((quote && (quote.status !== latest.status || quote.offerRevision !== latest.offerRevision)) || (revision && revision !== latest.revision) || (!quote && code.trim())) {
        setError(latest.status === "applied"
          ? "Código aplicado. Revisa el importe y pulsa Confirmar pedido."
          : "El importe se ha actualizado. Revísalo y pulsa Confirmar pedido.");
        return;
      }
      const body = {
        slug, code, selection, revision: latest.revision, offerRevision: latest.offerRevision, status: latest.status, total: currentTotal,
        customer: String(fields.get("customer") ?? ""), contact: String(fields.get("contact") ?? ""), notes: String(fields.get("notes") ?? ""),
        paymentMethod: String(fields.get("paymentMethod") ?? "") || undefined
      };
      await send({ ...body, id: latest.requestId }, restricted ? latest.payment : undefined);
    } catch {
      setError("No hemos podido comprobar si el pedido se guardó. Vuelve a intentarlo desde esta pantalla.");
    } finally {
      setBusy(false);
      setSubmitting(false);
    }
  }

  async function send(body: Attempt, instructions: PaymentDetails | undefined) {
    setAttempt(body);
    const result = await submitPromotion(body);
    setAttempt(undefined);
    if (result === "saved") setReceipt({ id: body.id, total: body.total, payment: instructions });
    else if (result === "limit") setError("Este nombre ya alcanza el máximo de 5 prendas al precio promocional, contando sus pedidos anteriores. Reduce la cantidad.");
    else if (result === "name") setError("Escribe el nombre y los apellidos para el pedido.");
    else if (result === "member") setError("Se han actualizado los datos del pedido. Vuelve a intentarlo.");
    else if (result === "changed") setError("El precio o la disponibilidad ha cambiado. Revisa tu pedido e inténtalo de nuevo.");
    else setError("No se pudo confirmar el pedido. Comprueba los datos e inténtalo de nuevo.");
  }

  if (receipt) return <section className={styles.card} role="status" tabIndex={-1} ref={checkoutFeedback}>
    <h2>Pedido recibido</h2>
    <p>Referencia {receipt.id}</p>
    {storefront && !receipt.payment ? <p className={styles.total}>Total {euros.format(receipt.total / 100)}</p> : null}
    {receipt.payment ? <>
      <p className={styles.total}>Importe a pagar {euros.format(receipt.total / 100)}</p>
      <PaymentNotice payment={receipt.payment} />
    </> : null}
    {storefront ? <button type="button" className="secondary-link" onClick={() => {
      setReceipt(undefined);
      setQuantities({});
      setCode("");
      setQuote(undefined);
    }}>Seguir comprando</button> : null}
  </section>;

  const codeField = <section className={`${styles.card} ${styles.promoCode}`} aria-labelledby="promotion-code-title">
        <h2 id="promotion-code-title"><Tag size={20} aria-hidden="true" /> Código promocional</h2>
        <p>Introduce tu código para aplicar el precio especial a tu pedido.</p>
        <div className={styles.promoCodeControls}>
          <input aria-label="Código promocional" aria-describedby="promotion-code-status" value={code}
            placeholder="Escribe aquí tu código" maxLength={50} autoCapitalize="characters" autoComplete="off" spellCheck={false}
            onChange={event => {
              setCode(event.target.value);
              setCodeError("");
              setQuote(undefined);
            }}
            onKeyDown={event => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              if (code.trim() && !busy) void apply();
            }} />
          <button type="button" onClick={apply} disabled={!code.trim()}>Aplicar código</button>
        </div>
        <p id="promotion-code-status" role="status" className={styles.promoCodeStatus}>{codeError || (quote ? messages[quote.status] : "")}</p>
      </section>;

  if (!showStorefront) return null;

  return <form className={styles.stack} onSubmit={checkout} data-no-global-feedback="true">
    <fieldset disabled={busy || !!attempt} className={styles.stack}>
      {!storefront ? codeField : null}
      {cover}
      {restricted ? <section className={styles.card}>
        <h2>¿A nombre de quién es el pedido?</h2>
        <label>Nombre y apellidos
          <input name="customer" required minLength={2} maxLength={160} autoComplete="name" />
        </label>
        <p>Máximo 5 prendas al precio promocional por persona, sumando sus pedidos de esta promoción.</p>
      </section> : null}
      {storefront ? <StoreGrid products={storefront.map(product => ({ ...product, options: product.options.map(option => ({ ...option, price: quotedPrices.get(option.id)?.price ?? option.price })) }))} add={(_product, option, quantity) => setQuantity(option.id, (quantities[option.id] ?? 0) + quantity)} /> : <div className={styles.grid}>
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
                <div className={styles.quantityControls}>
                  <button type="button" aria-label={"Quitar una unidad de " + product + " " + variant}
                    disabled={!quantities[id]} onClick={() => setQuantity(id, (quantities[id] ?? 0) - 1)}>
                    <Minus size={16} aria-hidden="true" />
                  </button>
                  <input id={id} aria-label={"Cantidad de " + product + " " + variant} inputMode="numeric" pattern="[0-9]*"
                    placeholder="0" value={quantities[id] || ""} onChange={event => {
                      const value = event.target.value;
                      if (/^\d*$/.test(value)) setQuantity(id, Number(value));
                    }} />
                  <button type="button" aria-label={"Añadir una unidad de " + product + " " + variant}
                    onClick={() => setQuantity(id, (quantities[id] ?? 0) + 1)}>
                    <Plus size={16} aria-hidden="true" />
                  </button>
                </div>
              </div>;
            })}
          </section>;
        })}
      </div>}
      {storefront && selection.length ? codeField : null}
      <section hidden={!!storefront && !selection.length} className={styles.card} id={storefront ? "pedido-ropa" : undefined}>
        <h2>{storefront ? "Tu pedido de ropa" : "Tu pedido"}</h2>
        <ul>{selection.map(({ id, quantity }) => {
          const item = variants.find(variant => variant.id === id)!;
          const price = quote?.lines.find(line => line.id === id)?.price ?? item.original;
          return <li key={id}>{quantity} × {item.product} · {item.variant} — {euros.format(quantity * price / 100)}
            {storefront ? <button type="button" onClick={() => setQuantity(id, 0)} aria-label={"Quitar " + item.product + " " + item.variant}>Quitar</button> : null}</li>;
        })}</ul>
        <p className={styles.total}>Total {euros.format(currentTotal / 100)}</p>
        {!restricted ? <>
          <label>Nombre para el pedido<input name="customer" required minLength={2} maxLength={160} autoComplete="name" /></label>
          <label>Teléfono o correo de contacto<input name="contact" required minLength={5} maxLength={160} /></label>
        </> : null}
        <label>Forma de pago prevista (opcional)
          <select name="paymentMethod" defaultValue="">
            <option value="">Sin indicar</option>
            {Object.entries(plannedPaymentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>Observaciones<textarea name="notes" maxLength={1000} /></label>
        {paymentNotice ? <PaymentNotice payment={paymentNotice} /> : null}
        {error ? <p className={styles.checkoutError} role="alert" ref={element => { checkoutFeedback.current = element; }} tabIndex={-1}>{error}</p> : null}
        <button className={styles.confirmOrder} disabled={!selection.length || quote?.status === "invalid"}>
          {submitting ? "Enviando pedido…" : "Confirmar pedido"}
        </button>
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
