"use client";

import { useRef, useState, type FormEvent } from "react";
import { ShoppingCart, X } from "lucide-react";
import { euros, generalShopSlug } from "@/lib/shop/promotion";
import { plannedPaymentLabels, type PlannedPaymentMethod } from "@/lib/shop/order-management";
import { promotionQuote, submitPromotion } from "../promociones/actions";
import { StoreCategories, StoreGrid, type StoreProduct } from "./catalog";
import styles from "./store.module.css";

type Item = { id: string; label: string; product: string; price: number; quantity: number; recipient?: string };
type Quote = Awaited<ReturnType<typeof promotionQuote>>;
type Receipt = { id: string; total: number; method: PlannedPaymentMethod; deadline?: string };

export function StoreCheckout({ clothing, material, revision, bizumPhone }: {
  clothing: StoreProduct[]; material: StoreProduct[]; revision: string; bizumPhone: string;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [code, setCode] = useState("");
  const [quote, setQuote] = useState<Quote>();
  const [codeNotice, setCodeNotice] = useState("");
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Receipt>();
  const dialog = useRef<HTMLDialogElement>(null);
  const attempt = useRef<{ fingerprint: string; id: string } | undefined>(undefined);
  const prices = new Map(quote?.lines.map(line => [line.id, line.price]));
  const units = items.reduce((sum, item) => sum + item.quantity, 0);
  const itemPrice = (item: Item) => item.recipient ? item.price : prices.get(item.id) ?? item.price;
  const total = items.reduce((sum, item) => sum + itemPrice(item) * item.quantity, 0);
  const hasClothing = items.some(item => !item.recipient);
  const hasCode = hasClothing && !!code.trim();
  const offerUsed = quote?.status === "applied" && quote.lines.some(line => line.eligible && items.some(item => !item.recipient && item.id === line.id));

  function openCart() {
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
  }

  function add(product: StoreProduct, option: StoreProduct["options"][number], quantity: number, recipient?: string) {
    if (busy) return false;
    const position = items.findIndex(item => item.id === option.id && item.recipient === recipient);
    const previous = items[position]?.quantity ?? 0;
    const maximum = recipient ? 10 : 99;
    if (previous + quantity > maximum || (position < 0 && items.filter(item => Boolean(item.recipient) === Boolean(recipient)).length >= (recipient ? 30 : 200))) return false;
    setReceipt(undefined);
    setItems(current => position < 0 ? [...current, {
      id: option.id, label: option.label, product: product.name, price: option.price, quantity, recipient
    }] : current.map((item, index) => index === position ? { ...item, quantity: previous + quantity } : item));
    return true;
  }

  async function applyCode() {
    if (busy || !code.trim()) return;
    setBusy(true);
    setCodeNotice("");
    try {
      const result = await promotionQuote({ slug: generalShopSlug, code });
      setQuote(result);
      setCodeNotice(result.status === "applied" ? "Código aplicado a las prendas incluidas."
        : result.status === "expired" ? "La promoción ha terminado. Se aplican los precios originales."
          : "El código promocional no es válido.");
    } catch {
      setCodeNotice("No se pudo comprobar el código. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  async function checkout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !items.length || (hasCode && (!quote || quote.status === "invalid"))) return;
    const form = new FormData(event.currentTarget);
    const method = form.get("paymentMethod");
    if (!form.get("consent") || (method !== "bizum" && method !== "cash")) return;
    const order = {
      slug: generalShopSlug,
      revision: quote?.revision ?? revision,
      offerRevision: hasCode ? quote?.offerRevision ?? null : null,
      status: hasCode ? quote?.status ?? "none" : "none",
      total,
      code: hasCode ? code.trim().toUpperCase() : "",
      customer: String(form.get("customer") ?? "").trim(),
      contact: String(form.get("contact") ?? "").trim(),
      notes: String(form.get("notes") ?? "").trim(),
      paymentMethod: method,
      selection: items.filter(item => !item.recipient).map(({ id, quantity }) => ({ id, quantity })),
      store: { material: items.flatMap(({ id, quantity, recipient }) => recipient ? [{ id, quantity, recipient }] : []) }
    };
    const fingerprint = JSON.stringify(order);
    if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, id: crypto.randomUUID() };
    const id = attempt.current.id;
    setBusy(true);
    setProblem("");
    try {
      const result = await submitPromotion({ ...order, id });
      if (result === "saved") {
        setReceipt({ id, total, method, deadline: offerUsed ? quote?.payment?.deadline : undefined });
        setItems([]);
        setQuote(undefined);
        setCode("");
        setCodeNotice("");
        attempt.current = undefined;
      } else {
        setProblem(result === "limit" ? "La promoción admite hasta cinco prendas con descuento por persona, incluidos sus pedidos anteriores."
          : result === "name" ? "Escribe el nombre y apellidos para aplicar la promoción."
            : result === "changed" ? "Ha cambiado el precio o la disponibilidad. Actualiza la tienda y vuelve a seleccionar los artículos."
              : "No se pudo confirmar el pedido. Revisa los datos y vuelve a intentarlo.");
      }
    } catch {
      setProblem("No se ha podido comprobar si el pedido se guardó. Puedes reintentar con los mismos datos.");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <StoreCategories>
      <StoreGrid products={clothing} onViewCart={openCart} add={(product, option, quantity) => add(product, option, quantity)} />
      <StoreGrid products={material} onViewCart={openCart} recipient add={add} />
    </StoreCategories>
    <button type="button" className={styles.cartTrigger} onClick={openCart}>
      <ShoppingCart size={20} aria-hidden="true" /> Carrito <span>{units}</span>
    </button>
    <dialog ref={dialog} className={styles.cartDialog} aria-labelledby="store-cart-title">
      <header className={styles.cartHeader}>
        <h2 id="store-cart-title">{receipt ? "Pedido recibido" : "Tu carrito"}</h2>
        <button type="button" onClick={() => dialog.current?.close()} aria-label="Cerrar carrito"><X size={22} aria-hidden="true" /></button>
      </header>
      {receipt ? <div className={styles.cartBody} role="status">
        <p>Referencia <strong>{receipt.id}</strong></p>
        <p className={styles.cartTotal}>Total {euros.format(receipt.total / 100)}</p>
        {receipt.method === "bizum" ? <p>Envía el importe por Bizum al <strong>{bizumPhone}</strong>. Indica tu nombre y apellidos en el concepto.</p>
          : <p>Paga el importe en efectivo en el club.</p>}
        {receipt.deadline ? <p>Último día de pago {receipt.deadline}.</p> : null}
        <p>El pedido queda pendiente hasta que el club confirme el pago.</p>
        <button type="button" className={styles.add} onClick={() => { setReceipt(undefined); dialog.current?.close(); }}>Seguir comprando</button>
      </div> : items.length ? <div className={styles.cartBody}>
        <ul className={styles.cartItems}>{items.map((item, index) => <li key={JSON.stringify([item.id, item.recipient])}>
          <div><strong>{item.product}</strong><small>{item.label}{item.recipient ? " · Para " + item.recipient : ""}</small></div>
          <strong>{euros.format(itemPrice(item) * item.quantity / 100)}</strong>
          <label>Unidades<input type="number" min={1} max={item.recipient ? 10 : 99} value={item.quantity} disabled={busy}
            onChange={event => {
              const next = Number(event.target.value);
              if (Number.isInteger(next) && next >= 1 && next <= (item.recipient ? 10 : 99)) setItems(current =>
                current.map((line, position) => position === index ? { ...line, quantity: next } : line));
            }} /></label>
          <button type="button" disabled={busy} onClick={() => setItems(current => current.filter((_, position) => position !== index))}>Quitar</button>
        </li>)}</ul>
        {hasClothing ? <div className={styles.cartCode}>
          <label>Código promocional (opcional)<input value={code} maxLength={50} disabled={busy} onChange={event => {
            setCode(event.target.value); setQuote(undefined); setCodeNotice("");
          }} /></label>
          <button type="button" disabled={!code.trim() || busy} onClick={applyCode}>Aplicar</button>
          {codeNotice ? <p role="status">{codeNotice}</p> : null}
        </div> : null}
        <p className={styles.cartTotal}>Total {euros.format(total / 100)}</p>
        <form className={styles.checkout} onSubmit={checkout} data-no-global-feedback="true">
          <label>Nombre y apellidos<input name="customer" required minLength={2} maxLength={160} autoComplete="name" /></label>
          <label>Teléfono o correo de contacto<input name="contact" required minLength={5} maxLength={160} /></label>
          <label>Forma de pago<select name="paymentMethod" defaultValue="" required>
            <option value="" disabled>Seleccionar</option>
            {Object.entries(plannedPaymentLabels).filter(([value]) => value !== "bizum" || bizumPhone).map(([value, label]) =>
              <option key={value} value={value}>{value === "cash" ? "En mano (efectivo)" : label}</option>)}
          </select></label>
          <label>Observaciones (opcional)<textarea name="notes" maxLength={1000} rows={2} /></label>
          <label className={styles.consent}><input name="consent" type="checkbox" required /> Acepto el uso de estos datos para gestionar mi pedido.</label>
          {problem ? <p role="alert">{problem}</p> : null}
          <button className={styles.add} disabled={busy || (hasCode && (!quote || quote.status === "invalid"))}>{busy ? "Procesando…" : "Confirmar pedido"}</button>
        </form>
      </div> : <div className={styles.cartBody}><p>Tu carrito está vacío.</p></div>}
    </dialog>
  </>;
}
