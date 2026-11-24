"use client";

import { useState } from "react";

export function PromotionPhoto({ src, alt, className, thumbnail = false }: {
  src: string; alt: string; className?: string; thumbnail?: boolean;
}) {
  const [failed, setFailed] = useState<string>();
  if (!src || src === failed) return null;
  return <img src={src} alt={alt} className={className} width={thumbnail ? 64 : undefined}
    height={thumbnail ? 64 : undefined} loading={thumbnail ? "lazy" : undefined}
    referrerPolicy="no-referrer" onError={() => setFailed(src)} />;
}
