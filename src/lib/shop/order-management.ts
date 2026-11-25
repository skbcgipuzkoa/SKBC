export const promotionPaymentLabels = {
  pending: "Pago pendiente",
  bizum: "Pagado por Bizum",
  cash: "Pagado en mano"
} as const;

export const promotionDeliveryLabels = {
  pending: "Pendiente de entrega",
  delivered: "Entregado"
} as const;

export type PromotionPaymentStatus = keyof typeof promotionPaymentLabels;
export type PromotionDeliveryStatus = keyof typeof promotionDeliveryLabels;

export const plannedPaymentLabels = {
  bizum: "Bizum",
  cash: "En mano"
} as const;

export type PlannedPaymentMethod = keyof typeof plannedPaymentLabels;
