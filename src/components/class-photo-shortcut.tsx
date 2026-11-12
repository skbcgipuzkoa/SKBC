"use client";

export function ClassPhotoShortcut({ classId, label }: { classId: string; label: string }) {
  function openAlbum() {
    const album = document.getElementById("fotos-clase-" + classId);
    if (!album) return;
    const panel = album.closest("details");
    if (panel) panel.open = true;
    const picker = album.querySelector<HTMLInputElement>('input[type="file"]');
    album.scrollIntoView({ block: "start" });
    if (picker && !picker.disabled) picker.click();
  }

  return <button type="button" className="secondary-button" onClick={openAlbum}>{label}</button>;
}
