import "server-only";

import { cache } from "react";
import { shopSection } from "@/lib/shop/catalog-sections";
import type { StoreProduct } from "./catalog";

export const clubWebsite = "https://www.skbcgipuzkoa.com";

const getConnection = cache(async () => {
  const source = await fetch(clubWebsite + "/content.js", { next: { revalidate: 300 }, signal: AbortSignal.timeout(6500) });
  if (!source.ok) throw new Error("Configuración de tienda no disponible");
  const raw = (await source.text()).trim();
  const { settings } = JSON.parse(raw.replace(/^window\.SKBC_CONTENT\s*=\s*/, "").replace(/;$/, ""));
  const url = new URL(settings.orderInbox?.supabaseUrl || settings.testimonialInbox?.supabaseUrl);
  const key = settings.orderInbox?.anonKey || settings.testimonialInbox?.anonKey;
  if (url.origin !== "https://wucxazuhrgokvtajqmsr.supabase.co" || typeof key !== "string" || !key ||
      ![true, "true"].includes(settings.orderInbox?.enabled)) throw new Error("Tienda de material no disponible");
  return { origin: url.origin, headers: { apikey: key, Authorization: "Bearer " + key } };
});

export async function materialRequest(path: string, body?: object) {
  const { origin, headers } = await getConnection();
  return fetch(origin + "/rest/v1/" + path, {
    headers: body ? { ...headers, "Content-Type": "application/json" } : headers,
    method: body ? "POST" : "GET",
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(12000)
  });
}

type MaterialRow = {
  product_id: string; product_name: string; category: string | null; image_url: string | null;
  brand: string | null; description: string | null; variant_id: string; variant_name: string;
  attributes: { size?: string; color?: string }; effective_price_cents: number;
};

export function storeImage(value?: string | null, origin = clubWebsite): string | undefined {
  if (!value) return;
  try {
    const url = new URL(value, origin);
    if (url.protocol === "https:" && !["icloud.com", "www.icloud.com"].includes(url.hostname)) return url.href;
  } catch {
    return;
  }
}

export async function loadMaterialProducts() {
  const params = "select=product_id,product_name,category,image_url,brand,description,variant_id,variant_name,attributes,effective_price_cents&order=product_sort_order,product_id,variant_sort_order,variant_id";
  const products = new Map<string, StoreProduct>();
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const response = await materialRequest("skbc_merch_catalog_public?" + params + "&limit=" + pageSize + "&offset=" + offset);
    if (!response.ok) throw new Error("Catálogo de material no disponible");
    const rows: MaterialRow[] = await response.json();
    for (const row of rows) {
      const category = row.category?.toLowerCase();
      const section = ["dogi", "dogis"].includes(category ?? "") ? "gi"
        : ["cinturon", "cinturones"].includes(category ?? "") ? "belt"
        : ["clothing", "ropa"].includes(category ?? "") ? "club"
        : category === "gi" || category === "club" || category === "belt" ? shopSection(category) : "other";
      const product = products.get(row.product_id) ?? {
        id: row.product_id, name: row.product_name, section,
        image: storeImage(row.image_url), brand: row.brand ?? undefined,
        description: row.description ?? undefined, options: []
      };
      product.options.push({
        id: row.variant_id,
        label: row.attributes?.size ? [row.attributes.color, row.attributes.size].filter(Boolean).join(" · ") : row.variant_name,
        price: row.effective_price_cents
      });
      products.set(product.id, product);
    }
    if (rows.length < pageSize) return [...products.values()];
  }
}
