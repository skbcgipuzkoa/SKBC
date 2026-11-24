"use client";

import { useState } from "react";
import type { Promotion } from "@/lib/shop/repository";
import { savePromotion } from "./actions";

type Row = { id: string; product: string; variant: string; image: string; original: string; offer: string };
type CatalogOption = Omit<Row, "offer">;

export function PromotionEditor({ promotion, catalog }: { promotion?: Promotion; catalog: CatalogOption[] }) {
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

  return <form action={savePromotion}>
    <input type="hidden" name="revision" value={promotion?.revision ?? ""} />
    <input type="hidden" name="variants" value={JSON.stringify(rows)} />
    <label>Identificador del enlace <input name="slug" readOnly={!!promotion} required pattern="[a-z0-9]+(-[a-z0-9]+)*" defaultValue={promotion?.slug} placeholder="equipacion-invierno" /></label>
    <label>Título <input name="title" required maxLength={160} defaultValue={promotion?.title} /></label>
    <label>Descripción <textarea name="description" maxLength={2000} defaultValue={promotion?.description} /></label>
    <label>URL de la imagen de portada <input name="cover_image" defaultValue={promotion?.cover_image} /></label>
    <label>Código de descuento <input name="code" required maxLength={50} defaultValue={promotion?.code} /></label>
    <label>Fecha y hora de caducidad con zona horaria
      <input name="expires_at" required defaultValue={promotion?.expires_at} placeholder="2026-12-01T23:59:00+01:00" />
    </label>
    <label><input type="checkbox" name="active" defaultChecked={promotion?.active ?? false} /> Página publicada</label>
    <fieldset>
      <legend>Productos y variantes de esta promoción</legend>
      {rows.map((row, index) => <fieldset key={row.id}>
        <legend>Variante {index + 1}</legend>
        {([["product", "Producto"], ["variant", "Talla o variante"], ["image", "URL de imagen"], ["original", "Precio original (€)"], ["offer", "Precio con código (€)"]] as const)
          .map(([field, label]) => <label key={field}>{label}
            <input required={field !== "image"} value={row[field]} inputMode={field === "offer" || field === "original" ? "decimal" : undefined}
              onChange={event => setRows(rows.map(item => item.id === row.id ? { ...item, [field]: event.target.value } : item))} />
          </label>)}
        <button type="button" onClick={() => setRows(rows.filter(item => item.id !== row.id))}>Quitar variante {index + 1}</button>
      </fieldset>)}
      <label>Origen del producto <select value={catalogId} onChange={event => setCatalogId(event.target.value)}>
        <option value="">Introducir un producto nuevo</option>
        {catalog.filter(item => !rows.some(row => row.id === item.id)).map(item =>
          <option value={item.id} key={item.id}>{item.product} · {item.variant}</option>)}
      </select></label>
      <button type="button" onClick={addRow} disabled={rows.length >= 200}>Añadir variante</button>
    </fieldset>
    <button disabled={!rows.length}>Guardar promoción</button>
  </form>;
}
