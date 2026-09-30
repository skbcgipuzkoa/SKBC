const CONTACT_SEPARATOR = " || ";

export function splitContactValues(value: string | null | undefined, kind: "email" | "text" = "text") {
  const pattern = kind === "email" ? /[;,]|\s\|\|\s/ : /\s\|\|\s/;
  return String(value ?? "").split(pattern).map((item) => item.trim()).filter(Boolean);
}

export function joinContactValues(primary: FormDataEntryValue | null, secondary: FormDataEntryValue | null, kind: "email" | "text" = "text") {
  const values = [primary, secondary].map((item) => String(item ?? "").trim()).filter(Boolean);
  if (!values.length) return null;
  return values.join(kind === "email" ? "; " : CONTACT_SEPARATOR);
}
