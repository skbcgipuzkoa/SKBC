import { promotionSizeLabel, promotionSizeProfiles } from "@/lib/shop/promotion-editor-options";
import type { QuotedLine } from "@/lib/shop/promotion";
import styles from "./promotions.module.css";

type Block = { product: string; sizes: readonly string[]; quantities: Map<string, number> };

export function SupplierSummary({ lines }: { lines: QuotedLine[] }) {
  const sections = new Map<string, Map<string, Block>>([
    ["Adultos", new Map()], ["Niños", new Map()], ["Otras variantes", new Map()]
  ]);
  for (const line of lines) {
    const profile = promotionSizeProfiles.find(item => item.sizes.some(size => promotionSizeLabel(item, size) === line.variant));
    const [garment, audience, size] = profile ? line.variant.split(" · ") : ["", "Otras variantes", line.variant];
    const product = profile && line.product.toLocaleLowerCase("es") === (garment + " " + audience).toLocaleLowerCase("es")
      ? garment : line.product;
    const blocks = sections.get(audience)!;
    const key = JSON.stringify([line.product, profile?.label]);
    const block = blocks.get(key) ?? { product, sizes: profile?.sizes ?? [], quantities: new Map<string, number>() };
    block.quantities.set(size, (block.quantities.get(size) ?? 0) + line.quantity);
    blocks.set(key, block);
  }

  if (!lines.length) return <p className={styles.empty}>Aún no hay prendas que incluir en el pedido a JHK.</p>;

  return <div className={styles.supplierGroups}>
    {[...sections].filter(([, blocks]) => blocks.size).map(([audience, blocks]) => <section key={audience} className={styles.supplierGroup}>
      <h3>{audience}</h3>
      {[...blocks].sort(([, left], [, right]) => left.product.localeCompare(right.product, "es")).map(([key, block]) => {
        const sizes = block.sizes.length ? block.sizes : [...block.quantities.keys()].sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
        const total = [...block.quantities.values()].reduce((sum, quantity) => sum + quantity, 0);
        return <div className={styles.supplierTableScroll} key={key} role="region" aria-label={block.product + " · " + audience} tabIndex={0}>
          <table className={styles.supplierTable}>
            <caption>{block.product}</caption>
            <thead><tr>
              <th scope="col">Talla</th>
              {sizes.map(size => <th scope="col" key={size}>{size}</th>)}
              <th scope="col">Total</th>
            </tr></thead>
            <tbody><tr>
              <th scope="row">Unidades</th>
              {sizes.map(size => <td key={size} data-ordered={block.quantities.has(size)}>
                {block.quantities.get(size) ?? 0}
              </td>)}
              <td className={styles.supplierTotal}>{total}</td>
            </tr></tbody>
          </table>
        </div>;
      })}
    </section>)}
  </div>;
}
