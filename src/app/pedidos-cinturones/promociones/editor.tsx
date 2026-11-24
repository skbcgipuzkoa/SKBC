"use client";

import { PackagePlus, Plus, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  expandPromotionRows, groupPromotionRows, promotionDeadlineFields, promotionSizeLabel, promotionSizeProfiles,
  type PromotionEditorRow, type PromotionEditorVariant
} from "@/lib/shop/promotion-editor-options";
import type { Promotion } from "@/lib/shop/repository";
import { savePromotion } from "./actions";
import styles from "./promotions.module.css";

type CatalogOption = Omit<PromotionEditorVariant, "offer">;

export function PromotionEditor({ promotion, catalog, catalogAvailable }: { promotion?: Promotion; catalog: CatalogOption[]; catalogAvailable: boolean }) {
  const [rows, setRows] = useState<PromotionEditorRow[]>(() => groupPromotionRows(promotion?.variants.map(variant => ({
    ...variant, image: variant.image ?? "", original: (variant.original / 100).toFixed(2), offer: (variant.offer / 100).toFixed(2)
  })) ?? []));
  const [catalogId, setCatalogId] = useState("");
  const variants = expandPromotionRows(rows);
  const deadline = promotionDeadlineFields(promotion?.expires_at ?? "");

  function updateRow(id: string, field: keyof Omit<PromotionEditorVariant, "id">, value: string) {
    setRows(current => current.map(item => item.id === id ? { ...item, [field]: value } : item));
  }

  function addRow() {
    const option = catalog.find(item => item.id === catalogId);
    if (option && variants.some(variant => variant.id === option.id)) return;
    setRows([...rows, option ? { ...option, offer: option.original } : {
      id: crypto.randomUUID(), product: "", variant: "Única", image: "", original: "", offer: ""
    }]);
  }

  function selectProfile(row: PromotionEditorRow, label: string) {
    const profile = promotionSizeProfiles.find(item => item.label === label);
    const previous = row.sizes ?? [{ id: row.id, variant: row.variant }];
    const sizes = profile?.sizes.map(size => {
      const variant = promotionSizeLabel(profile, size);
      const existing = previous.find(item => item.variant === variant);
      return existing ?? { id: crypto.randomUUID(), variant };
    });
    setRows(current => current.map(item => item.id === row.id
      ? { ...item, variant: sizes?.[0]?.variant ?? "Única", sizes } : item));
  }

  return <form action={savePromotion} className={styles.stack}>
    <input type="hidden" name="revision" value={promotion?.revision ?? ""} />
    <input type="hidden" name="variants" value={JSON.stringify(variants)} />
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
          <div className={styles.dateInputs}>
            <label>Día de caducidad<input name="expiry_day" type="date" required defaultValue={deadline.day} aria-describedby="promotion-expiry-zone" /></label>
            <label>Hora de caducidad<input name="expiry_time" type="time" step={1} required defaultValue={deadline.time} aria-describedby="promotion-expiry-zone" /></label>
          </div>
          <input type="hidden" name="previous_expiry" value={promotion?.expires_at ?? ""} />
          <small id="promotion-expiry-zone">Hora peninsular</small>
        </div>
        <label className={`checkbox-line wide ${styles.publishToggle}`}><input type="checkbox" name="active" defaultChecked={promotion?.active ?? false} /> Página publicada</label>
      </div>
    </section>

    <section className={`card ${styles.panel}`}>
      <h2>Productos y variantes</h2>
      <div className={`form-grid ${styles.addVariant} ${styles.fields}`}>
        <label>Origen del producto <select value={catalogId} onChange={event => setCatalogId(event.target.value)}>
          <option value="">Introducir un producto nuevo</option>
          {catalog.filter(item => !variants.some(variant => variant.id === item.id)).map(item =>
            <option value={item.id} key={item.id}>{item.product} · {item.variant}</option>)}
        </select></label>
        <button className="secondary-link" type="button" onClick={() => { addRow(); setCatalogId(""); }} disabled={variants.length >= 200}>
          <Plus size={16} aria-hidden="true" /> Añadir producto
        </button>
      </div>
      {!catalogAvailable ? <p className={styles.muted}>El catálogo existente no está disponible. Puedes introducir los productos manualmente.</p> : null}
      {!rows.length ? <p className={styles.empty}><PackagePlus size={20} aria-hidden="true" /> Añade al menos un producto para guardar la promoción.</p> : null}
      {rows.map((row, index) => {
        const profile = row.sizes && promotionSizeProfiles.find(item => row.variant.startsWith(item.label + " · "));
        return <fieldset className={styles.variant} key={row.id}>
          <legend>{row.product || `Variante ${index + 1}`}</legend>
          <div className={`form-grid ${styles.fields}`}>
            <label>Producto<input required value={row.product} onChange={event => updateRow(row.id, "product", event.target.value)} /></label>
            <label>Prenda y grupo de tallas
              <select value={profile?.label ?? ""} onChange={event => selectProfile(row, event.target.value)}>
                <option value="">Otra variante o talla única</option>
                {promotionSizeProfiles.map(item => <option key={item.label}>{item.label}</option>)}
              </select>
            </label>
            {profile ? <p className={`wide ${styles.empty}`}><strong>Todas las tallas incluidas</strong> {profile.sizes.join(", ")}</p>
              : <label className="wide">Talla o variante<input required value={row.variant} onChange={event => updateRow(row.id, "variant", event.target.value)} /></label>}
            {([["original", "Precio original (€)"], ["offer", "Precio con código (€)"], ["image", "URL de imagen"]] as const)
              .map(([field, label]) => <label key={field} className={field === "image" ? "wide" : undefined}>{label}
                <input required={field !== "image"} value={row[field]} inputMode={field === "image" ? undefined : "decimal"}
                  onChange={event => updateRow(row.id, field, event.target.value)} />
              </label>)}
          </div>
          <button className="secondary-link" type="button" onClick={() => setRows(current => current.filter(item => item.id !== row.id))}>
            <Trash2 size={16} aria-hidden="true" /> Quitar producto {index + 1}
          </button>
        </fieldset>;
      })}
    </section>
    {variants.length > 200 ? <p className="form-error" role="alert">La promoción admite hasta 200 variantes. Quita algún producto para poder guardarla.</p> : null}
    <div className={styles.footer}>
      <button className="primary-link" disabled={!variants.length || variants.length > 200}><Save size={17} aria-hidden="true" /> Guardar promoción</button>
    </div>
  </form>;
}
