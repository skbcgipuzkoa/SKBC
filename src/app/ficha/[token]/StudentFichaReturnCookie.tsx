"use client";

import { useEffect } from "react";

type Props = {
  path: string;
  enabled: boolean;
};

export function StudentFichaReturnCookie({ path, enabled }: Props) {
  useEffect(() => {
    if (!enabled || !/^\/ficha\/[A-Za-z0-9_-]+$/.test(path)) return;
    document.cookie = `skbc_student_ficha_return=${encodeURIComponent(path)}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
  }, [enabled, path]);

  return null;
}
