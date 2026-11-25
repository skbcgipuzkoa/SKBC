import { SidebarNav } from "@/app/components/SidebarNav";
import { requirePromotionAdmin } from "@/lib/shop/admin";

export default async function StoreAdminPage() {
  await requirePromotionAdmin();
  return <div className="shell">
    <SidebarNav current="/pedidos-cinturones/tienda" />
    <main className="main">
      <header className="topbar"><div><p className="eyebrow">Tienda del club</p><h1>Gestionar tienda</h1></div>
        <a className="primary-link" href="/tienda">Ver tienda pública</a>
      </header>
      <section className="card">
        <h2>Catálogo y pedidos</h2>
        <div className="top-actions">
          <a className="secondary-link" href="/pedidos-cinturones?tab=catalog">Gestionar catálogo de material</a>
          <a className="secondary-link" href="/pedidos-cinturones/promociones?promo=tienda-general">Gestionar ropa publicada</a>
          <a className="secondary-link" href="/pedidos-cinturones/promociones">Gestionar promociones</a>
          <a className="secondary-link" href="/pedidos-cinturones?tab=payments">Gestionar cobros y entregas</a>
        </div>
      </section>
    </main>
  </div>;
}
