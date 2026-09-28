"use client";

import { Plus, Send, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { MaterialOrderEmailGroup, MaterialOrderPaymentMethod } from "@/lib/email-notifications";

type MemberOption = { id: string; name: string; email: string };
type EditableGroup = MaterialOrderEmailGroup & { key: string; enabled: boolean };

export function MaterialOrderEmailCampaign({
  action,
  members,
  initialGroups
}: {
  action: (formData: FormData) => void | Promise<void>;
  members: MemberOption[];
  initialGroups: MaterialOrderEmailGroup[];
}) {
  const [groups, setGroups] = useState<EditableGroup[]>(() => initialGroups.map((group, index) => ({ ...group, key: `initial-${index}`, enabled: true })));
  const selected = groups.filter((group) => group.enabled && group.memberId && group.items.length);
  const total = selected.reduce((sum, group) => sum + group.items.reduce((itemSum, item) => itemSum + item.amountCents, 0), 0);
  const payload = useMemo(() => JSON.stringify(selected.map(({ key: _key, enabled: _enabled, ...group }) => group)), [selected]);

  function updateGroup(key: string, update: Partial<EditableGroup>) {
    setGroups((current) => current.map((group) => group.key === key ? { ...group, ...update } : group));
  }

  function addGroup() {
    setGroups((current) => [...current, { key: `new-${Date.now()}`, enabled: true, memberId: "", payerName: "", paymentMethod: "cash", items: [{ student: "", concept: "", amountCents: 0 }] }]);
  }

  return (
    <form action={action} className="material-campaign-form">
      <input type="hidden" name="groups" value={payload} />
      <label>
        Asunto
        <input name="subject" required defaultValue="Pedido de material SKBC - septiembre 2026" />
      </label>
      <div className="material-campaign-toolbar">
        <p className="muted">{selected.length} comunicaciones · {formatEuros(total)}</p>
        <button className="secondary-button" type="button" onClick={addGroup}><Plus aria-hidden="true" size={16} />Añadir responsable</button>
      </div>
      <div className="material-campaign-groups">
        {groups.map((group) => {
          const groupTotal = group.items.reduce((sum, item) => sum + item.amountCents, 0);
          return (
            <details className="material-campaign-group" key={group.key} open={!group.memberId}>
              <summary>
                <label className="checkbox-line" onClick={(event) => event.stopPropagation()}>
                  <input type="checkbox" checked={group.enabled} onChange={(event) => updateGroup(group.key, { enabled: event.target.checked })} />
                  <strong>{group.payerName || "Nuevo responsable"}</strong>
                </label>
                <span>{formatEuros(groupTotal)} · {paymentLabel(group.paymentMethod)}</span>
              </summary>
              <div className="material-campaign-editor">
                <label>
                  Ficha que aporta el email
                  <select value={group.memberId} onChange={(event) => updateGroup(group.key, { memberId: event.target.value })}>
                    <option value="">Selecciona un kenshi</option>
                    {members.map((member) => <option key={member.id} value={member.id}>{member.name} · {member.email}</option>)}
                  </select>
                </label>
                <label>
                  Nombre del responsable
                  <input value={group.payerName} onChange={(event) => updateGroup(group.key, { payerName: event.target.value })} />
                </label>
                <label>
                  Forma de pago
                  <select value={group.paymentMethod} onChange={(event) => updateGroup(group.key, { paymentMethod: event.target.value as MaterialOrderPaymentMethod })}>
                    <option value="cash">Entregar en el club</option>
                    <option value="bank">Cargar en cuenta</option>
                    <option value="paid">Pagado</option>
                  </select>
                </label>
                <div className="material-order-lines">
                  {group.items.map((item, itemIndex) => (
                    <div className="material-order-line" key={`${group.key}-${itemIndex}`}>
                      <input aria-label="Alumno" placeholder="Alumno" value={item.student} onChange={(event) => updateGroup(group.key, { items: replaceItem(group.items, itemIndex, { ...item, student: event.target.value }) })} />
                      <input aria-label="Articulo" placeholder="Articulo y talla" value={item.concept} onChange={(event) => updateGroup(group.key, { items: replaceItem(group.items, itemIndex, { ...item, concept: event.target.value }) })} />
                      <input aria-label="Importe" type="number" min="0" step="0.01" value={(item.amountCents / 100).toFixed(2)} onChange={(event) => updateGroup(group.key, { items: replaceItem(group.items, itemIndex, { ...item, amountCents: Math.round(Number(event.target.value || 0) * 100) }) })} />
                      <button className="icon-button" type="button" title="Eliminar articulo" aria-label="Eliminar articulo" onClick={() => updateGroup(group.key, { items: group.items.filter((_, index) => index !== itemIndex) })}><Trash2 aria-hidden="true" size={16} /></button>
                    </div>
                  ))}
                  <button className="secondary-button" type="button" onClick={() => updateGroup(group.key, { items: [...group.items, { student: "", concept: "", amountCents: 0 }] })}><Plus aria-hidden="true" size={16} />Añadir artículo</button>
                </div>
                <div className="material-email-preview">
                  <strong>Vista previa</strong>
                  <p>Hola, {group.payerName || "familia"}:</p>
                  <ul>{group.items.map((item, index) => <li key={index}>{item.student || "Alumno"}: {item.concept || "Artículo"} · {formatEuros(item.amountCents)}</li>)}</ul>
                  <p><strong>Total: {formatEuros(groupTotal)}</strong></p>
                  <p>{paymentMessage(group.paymentMethod)}</p>
                </div>
                <button className="secondary-button danger-button" type="button" onClick={() => setGroups((current) => current.filter((item) => item.key !== group.key))}><Trash2 aria-hidden="true" size={16} />Eliminar responsable</button>
              </div>
            </details>
          );
        })}
      </div>
      <div className="material-campaign-actions">
        <p className="muted">El envío de prueba llega solo al correo del club. El envío final requiere confirmación.</p>
        <button className="secondary-button" type="submit" name="mode" value="test"><Send aria-hidden="true" size={16} />Enviar prueba</button>
        <button type="submit" name="mode" value="send" onClick={(event) => { if (!window.confirm(`Se enviarán ${selected.length} emails personalizados. ¿Continuar?`)) event.preventDefault(); }}><Send aria-hidden="true" size={16} />Enviar comunicaciones</button>
      </div>
    </form>
  );
}

function replaceItem(items: MaterialOrderEmailGroup["items"], index: number, value: MaterialOrderEmailGroup["items"][number]) {
  return items.map((item, itemIndex) => itemIndex === index ? value : item);
}

function formatEuros(cents: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);
}

function paymentLabel(method: MaterialOrderPaymentMethod) {
  if (method === "bank") return "Cuenta corriente";
  if (method === "paid") return "Pagado";
  return "Entregar en el club";
}

function paymentMessage(method: MaterialOrderPaymentMethod) {
  if (method === "bank") return "Se cargará en la cuenta bancaria habitual. No es necesario traer dinero.";
  if (method === "paid") return "Pago recibido. No queda ningún importe pendiente.";
  return "El importe debe entregarse en el club.";
}
