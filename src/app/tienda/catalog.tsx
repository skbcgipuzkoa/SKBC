"use client";

import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { Expand, Package, Plus } from "lucide-react";
import { shopSections, type ShopSection } from "@/lib/shop/catalog-sections";
import { euros } from "@/lib/shop/promotion";
import styles from "./store.module.css";

type StoreSection = ShopSection | "all" | "edition-2027";
const SectionContext = createContext<StoreSection>("all");

export function StoreCategories({ children }: { children: ReactNode }) {
  const [section, setSection] = useState<StoreSection>("all");
  const results = useRef<HTMLDivElement>(null);

  function selectSection(next: StoreSection) {
    if (next === section) return;
    setSection(next);
    const panel = results.current;
    if (panel && panel.getBoundingClientRect().top < 0) panel.scrollIntoView({ block: "start" });
  }

  return <SectionContext.Provider value={section}>
    <div className={styles.catalogLayout}>
      <nav className={styles.categories} aria-label="Categorías de la tienda">
        <p className={styles.categoryHeading}>Categorías</p>
        <button type="button" aria-pressed={section === "all"} onClick={() => selectSection("all")}>Todo</button>
        {Object.entries(shopSections).map(([key, name]) => key === "club" ? <div key={key} className={styles.categoryGroup}>
          <button type="button" aria-pressed={section === "club"} onClick={() => selectSection("club")}>{name}</button>
          {section === "club" || section === "edition-2027" ? <button className={styles.subcategory} type="button" aria-pressed={section === "edition-2027"}
            onClick={() => selectSection("edition-2027")}>Edición 2027</button> : null}
        </div> : <button key={key} type="button" aria-pressed={key === section} onClick={() => selectSection(key as ShopSection)}>{name}</button>)}
      </nav>
      <div className={styles.catalogResults} ref={results}>{children}</div>
    </div>
  </SectionContext.Provider>;
}

type Option = { id: string; label: string; price: number; image?: string };
export type StoreProduct = {
  id: string; name: string; section: ShopSection; edition?: "2027"; image?: string; brand?: string; description?: string; options: Option[];
};

export function matchesStoreSection(product: StoreProduct, section: StoreSection) {
  if (section === "edition-2027") return product.section === "club" && product.edition === "2027";
  return section === "all" || product.section === section;
}

export function StoreGrid({ products, add, onViewCart, recipient = false }: {
  products: StoreProduct[]; onViewCart: () => void; add: (product: StoreProduct, option: Option, quantity: number, name: string) => boolean | void; recipient?: boolean;
}) {
  const section = useContext(SectionContext);
  const visible = products.filter(product => matchesStoreSection(product, section));
  const edition = visible.filter(product => product.edition === "2027");
  const regular = visible.filter(product => !product.edition);
  if (!visible.length) return null;

  function cards(items: StoreProduct[]) {
    return <div className={styles.grid}>{items.map(product => <ProductCard key={product.id} product={product} add={add} onViewCart={onViewCart} recipient={recipient} />)}</div>;
  }

  return <>
    {edition.length ? <details key={section} className={styles.collection} open={section === "edition-2027" || undefined}>
      <summary>Edición 2027 <span>{edition.length} {edition.length === 1 ? "prenda" : "prendas"}</span></summary>
      {cards(edition)}
    </details> : null}
    {regular.length ? cards(regular) : null}
  </>;
}

function ProductCard({ product, add, onViewCart, recipient }: {
  product: StoreProduct; onViewCart: () => void; add: (product: StoreProduct, option: Option, quantity: number, name: string) => boolean | void; recipient: boolean;
}) {
  const [id, setId] = useState(product.options.length === 1 ? product.options[0].id : "");
  const [quantity, setQuantity] = useState("1");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [failedImage, setFailedImage] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const option = product.options.find(item => item.id === id);
  const image = option?.image || product.image;
  const showImage = image && failedImage !== image;
  const minimum = Math.min(...product.options.map(item => item.price));
  const maximum = Math.max(...product.options.map(item => item.price));
  const units = Number(quantity);
  const validQuantity = Number.isInteger(units) && units >= 1 && units <= (recipient ? 10 : 99);

  return <article className={styles.product}>
    <div className={styles.media}>
      {showImage ? <button type="button" onClick={() => dialog.current?.showModal()} aria-label={"Ampliar foto de " + product.name}>
        <img src={image} alt={product.name} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedImage(image)} />
        <span><Expand size={17} aria-hidden="true" /></span>
      </button> : <div className={styles.placeholder}><Package size={45} strokeWidth={1.1} aria-hidden="true" /></div>}
    </div>
    <div className={styles.productBody}>
      <p className={styles.meta}>{shopSections[product.section]}{product.brand ? " · " + product.brand : ""}</p>
      <h2>{product.name}</h2>
      <strong className={styles.price}>{!option && minimum !== maximum ? "Desde " : ""}{euros.format((option?.price ?? minimum) / 100)}</strong>
      {product.description ? <details className={styles.description}><summary>Detalles</summary><p>{product.description}</p></details> : null}
      {recipient && product.section === "gi" ? <a className={styles.guide} href="https://www.skbcgipuzkoa.com/assets/guides/guia-tallas-dogis.png" target="_blank" rel="noreferrer">Guía de tallas de dogi</a> : null}
      <div className={styles.options}>
        <label>{recipient ? "Talla / variante" : "Talla"}
          <select value={id} onChange={event => { setId(event.target.value); setMessage(""); }}>
            <option value="">Seleccionar</option>
            {product.options.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label>Unidades<input type="number" min={1} max={recipient ? 10 : 99} value={quantity} onChange={event => setQuantity(event.target.value)} /></label>
      </div>
      {recipient ? <label>Para quién es<input maxLength={120} value={name} onChange={event => setName(event.target.value)} autoComplete="off" /></label> : null}
      <button className={styles.add} type="button" disabled={!option || !validQuantity || (recipient && !name.trim())}
        onClick={() => { if (option) { const added = add(product, option, units, name.trim()); setMessage(added === false ? "No se pudo añadir. Revisa tu pedido." : "Añadido al pedido"); } }}>
        <Plus size={17} aria-hidden="true" /> Añadir al pedido
      </button>
      <span className={styles.feedback} role="status">{message === "Añadido al pedido" ? <button type="button" onClick={onViewCart}>Añadido · Ver carrito</button> : message}</span>
    </div>
    {showImage ? <dialog className={styles.photoDialog} ref={dialog} aria-label={"Foto de " + product.name} onClick={event => {
      if (event.target === event.currentTarget) event.currentTarget.close();
    }}>
      <button type="button" onClick={() => dialog.current?.close()}>Cerrar foto</button>
      <img src={image} alt={product.name} loading="lazy" referrerPolicy="no-referrer" />
    </dialog> : null}
  </article>;
}
