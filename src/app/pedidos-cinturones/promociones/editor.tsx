"use client";

import { PackagePlus, Plus, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import type { Promotion } from "@/lib/shop/repository";
import { savePromotion } from "./actions";
import styles from "./promotions.module.css";

type Row = { id: string; product: string; variant: string; image: string; original: string; offer: string };
type CatalogOption = Omit<Row, "offer">;

export function PromotionEditor({ promotion, catalog, catalogAvailable }: { promotion?: Promotion; catalog: CatalogOption[]; catalogAvailable: boolean }) {
  const [rows, setRows] = useState<Row[]>(promotion?.variants.map(variant => ({
    ...variant, image: variant.image ?? "", original: (variant.original / 100).toFixed(2), offer: (variant.offer / 100).toFixed(2)
  })) ?? []);
  const [catalogId, setCatalogId] = useState("");

  function addRow() {
    const option = catalog.find(item => item.id === catalogId);
    if (option && rows.some(row => row.id === option.id)) return;
    setRows([...rows, option ? { ...option, offer: option.original } : {
      id: crypto.randomUUID(), product: "", variant: "Única", image: "", original: "", offer: ""
    }]);
  }

  return <form action={savePromotion} className={styles.stack}>
    <input type="hidden" name="revision" value={promotion?.revision ?? ""} />
    <input type="hidden" name="variants" value={JSON.stringify(rows)} />
    <section className={`card ${styles.panel}`}>
      <h2>{promotion ? "Editar promoción" : "Crear promoción"}</h2>
      <div className={`form-grid ${styles.fields}`}>
        <label>Título <input name="title" required maxLength={160} defaultValue={promotion?.title} /></label>
        <label>Identificador del enlace <input name="slug" readOnly={!!promotion} required pattern="[a-z0-9]+(-[a-z0-9]+)*" defaultValue={promotion?.slug} placeholder="equipacion-invierno" /></label>
        <label className="wide">Descripción <textarea name="description" rows={3} maxLength={2000} defaultValue={promotion?.description} /></label>
        <label className="wide">URL de la imagen de portada <input name="cover_image" defaultValue={promotion?.cover_image} placeholder="https://" /></label>
      </div>
    </section>

    <section className={`card ${styles.panel}`}>
      <h2>Descuento y publicación</h2>
      <div className={`form-grid ${styles.fields}`}>
        <label>Código de descuento <input name="code" required maxLength={50} defaultValue={promotion?.code} /></label>
        <div className={styles.dateField}>
          <label>Fecha y hora de caducidad
            <input name="expires_at" required defaultValue={promotion?.expires_at} aria-describedby="promotion-expiry-format" />
          </label>
          <small id="promotion-expiry-format">Incluye la zona horaria. Ejemplo: 2026-12-01T23:59:00+01:00</small>
        </div>
        <label className={`checkbox-line wide ${styles.publishToggle}`}><input type="checkbox" name="active" defaultChecked={promotion?.active ?? false} /> Página publicada</label>
      </div>
    </section>

    <section className={`card ${styles.panel}`}>
      <h2>Productos y variantes</h2>
      <div className={`form-grid ${styles.addVariant} ${styles.fields}`}>
        <label>Origen del producto <select value={catalogId} onChange={event => setCatalogId(event.target.value)}>
          <option value="">Introducir un producto nuevo</option>
          {catalog.filter(item => !rows.some(row => row.id === item.id)).map(item =>
            <option value={item.id} key={item.id}>{item.product} · {item.variant}</option>)}
        </select></label>
        <button className="secondary-link" type="button" onClick={() => { addRow(); setCatalogId(""); }} disabled={rows.length >= 200}>
          <Plus size={16} aria-hidden="true" /> Añadir variante
        </button>
      </div>
      {!catalogAvailable ? <p className={styles.muted}>El catálogo existente no está disponible. Puedes introducir los productos manualmente.</p> : null}
      {!rows.length ? <p className={styles.empty}><PackagePlus size={20} aria-hidden="true" /> Añade al menos una variante para guardar la promoción.</p> : null}
      {rows.map((row, index) => <fieldset className={styles.variant} key={row.id}>
        <legend>{row.product || `Variante ${index + 1}`}</legend>
        <div className={`form-grid ${styles.fields}`}>
          {([["product", "Producto"], ["variant", "Talla o variante"], ["original", "Precio original (€)"], ["offer", "Precio con código (€)"], ["image", "URL de imagen"]] as const)
            .map(([field, label]) => <label key={field} className={field === "image" ? "wide" : undefined}>{label}
              <input required={field !== "image"} value={row[field]} inputMode={field === "offer" || field === "original" ? "decimal" : undefined}
                onChange={event => setRows(rows.map(item => item.id === row.id ? { ...item, [field]: event.target.value } : item))} />
            </label>)}
        </div>
        <button className="secondary-link" type="button" onClick={() => setRows(rows.filter(item => item.id !== row.id))}>
          <Trash2 size={16} aria-hidden="true" /> Quitar variante {index + 1}
        </button>
      </fieldset>)}
    </section>
    <div className={styles.footer}>
      <button className="primary-link" disabled={!rows.length}><Save size={17} aria-hidden="true" /> Guardar promoción</button>
    </div>
  </form>;
}
