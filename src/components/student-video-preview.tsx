"use client";
import { useState } from "react";
import { PlayCircle, ExternalLink } from "lucide-react";

export function StudentVideoPreview({ url, embedUrl, title }: { url: string; embedUrl: string | null; title: string }) {
  const [open, setOpen] = useState(false);
  if (!embedUrl) return <a className="student-open-link" href={url} target="_blank" rel="noopener noreferrer external" data-ficha-video={title}>Ver vídeo <ExternalLink aria-hidden="true" size={16} /></a>;
  return <div className="student-video-embed">
    {open ? <iframe allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen loading="lazy" referrerPolicy="strict-origin-when-cross-origin" src={embedUrl} title={title} /> :
      <button type="button" className="student-video-open" data-ficha-video={title} onClick={() => setOpen(true)}><PlayCircle size={30} aria-hidden="true" /><span>Abrir vídeo</span></button>}
    <a href={url} target="_blank" rel="noopener noreferrer external" data-ficha-video={title}>Abrir en YouTube <ExternalLink aria-hidden="true" size={14} /></a>
  </div>;
}
