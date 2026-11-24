"use client";

import { useState } from "react";
import { uploadPromotionImage } from "./actions";

export function PromotionImageField({ label, name, value, onChange, onUploading }: {
  label: string; name?: string; value: string; onChange: (value: string) => void; onUploading: (change: number) => void;
}) {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    setStatus("");
    onUploading(1);
    try {
      const form = new FormData();
      form.set("image", file);
      const result = await uploadPromotionImage(form);
      if (result.url) {
        onChange(result.url);
        setStatus("Imagen subida.");
      } else {
        setStatus(result.error ?? "No se pudo subir la imagen.");
      }
    } catch {
      setStatus("No se pudo subir la imagen. Inténtalo de nuevo.");
    } finally {
      onUploading(-1);
      setBusy(false);
    }
  }

  return <div className="wide">
    <label>{label}<input name={name} value={value} onChange={event => onChange(event.target.value)} placeholder="https://" /></label>
    <label>Subir imagen desde el dispositivo
      <input type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" disabled={busy} onChange={event => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        if (file.size > 4_000_000) {
          setStatus("Selecciona una imagen de hasta 4 MB.");
          return;
        }
        void upload(file);
      }} />
    </label>
    {busy || status ? <small role="status">{busy ? "Subiendo imagen…" : status}</small> : null}
  </div>;
}
