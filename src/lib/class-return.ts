export function safeClassReturnPath(value: string | null | undefined) {
  const path = String(value ?? "").trim();
  if (path.startsWith("/dojo/") || path.startsWith("/clases/")) return path;
  return "";
}

export function appendClassReturn(url: string, returnTo: string) {
  if (!returnTo) return url;
  return `${url}${url.includes("?") ? "&" : "?"}returnTo=${encodeURIComponent(returnTo)}`;
}
