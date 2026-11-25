"use client";

import { useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { deletePromotionOrder } from "./actions";
import styles from "./promotions.module.css";

function DeleteControls({ cancel }: { cancel: () => void }) {
  const { pending } = useFormStatus();
  return <div className={styles.deleteControls}>
    <button type="button" className="secondary-link" onClick={cancel} disabled={pending} autoFocus>Cancelar</button>
    <button type="submit" className="danger-button" disabled={pending}>{pending ? "Eliminando…" : "Eliminar definitivamente"}</button>
  </div>;
}

export function DeleteOrderButton({ customer, amount, children }: { customer: string; amount: string; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  return <>
    <button type="button" className={styles.deleteOrder} onClick={() => dialog.current?.showModal()}
      aria-label={"Eliminar pedido de " + customer}>Eliminar pedido</button>
    <dialog ref={dialog} className={styles.deleteDialog} aria-label="Confirmar eliminación del pedido">
      <h3>¿Eliminar este pedido?</h3>
      <p><strong>{customer}</strong> · {amount}</p>
      <p>Se borrará definitivamente del listado y de los totales.</p>
      <form action={deletePromotionOrder}>
        {children}
        <input type="hidden" name="confirmed" value="yes" />
        <DeleteControls cancel={() => dialog.current?.close()} />
      </form>
    </dialog>
  </>;
}
