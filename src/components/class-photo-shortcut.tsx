"use client";
import { Camera, Plus } from "lucide-react";
import "@/app/class-photos.css";

export function ClassPhotoShortcut({ classId, label, group = "adults" }: { classId: string; label: string; group?: "kids" | "adults" }) {
  function openAlbum() {
    const album = document.getElementById("fotos-clase-" + classId);
    if (!album) return;
    const panel = album.closest("details");
    if (panel) panel.open = true;
    const picker = album.querySelector<HTMLInputElement>('input[type="file"]');
    album.scrollIntoView({ block: "start" });
    if (picker && !picker.disabled) picker.click();
  }

  return <button type="button" className={`class-photo-shortcut class-photo-shortcut--${group}`} onClick={openAlbum}>
    <span className="class-photo-shortcut-icon"><Camera size={25} aria-hidden="true" /></span>
    <span className="class-photo-shortcut-copy"><strong>{label}</strong><span>Seleccionar fotos del móvil u ordenador</span></span>
    <Plus size={22} className="class-photo-shortcut-plus" aria-hidden="true" />
  </button>;
}
