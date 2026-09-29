export type WebOrderJson =
  | string
  | number
  | boolean
  | null
  | { [key: string]: WebOrderJson | undefined }
  | WebOrderJson[];

export type WebOrderStatus =
  | "pending"
  | "seen"
  | "contacted"
  | "payment_pending"
  | "paid"
  | "delivered"
  | "cancelled";
export type WebOrderCampaignStatus = "open" | "closed";
export type WebOrderCommunicationChannel = "email" | "phone" | "whatsapp" | "in_person" | "internal";
export type WebOrderCommunicationDirection = "inbound" | "outbound" | "internal";
export type WebOrderPaymentMethod = string;

export type WebOrderProduct = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  brand: string | null;
  supplier_reference: string;
  category: string | null;
  recommended_level: string | null;
  weight: string | null;
  image_url: string | null;
  source_url: string | null;
  image_attribution: string | null;
  catalog_owner: string | null;
  metadata: WebOrderJson;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type WebOrderVariant = {
  id: string;
  product_id: string;
  sku: string;
  name: string;
  attributes: WebOrderJson;
  supplier_reference: string;
  cost_cents: number;
  margin_cents: number;
  price_cents: number;
  unit_price_cents: number;
  cost_basis: string;
  promotion_price_cents: number | null;
  promotion_starts_at: string | null;
  promotion_ends_at: string | null;
  promotion_is_active: boolean;
  catalog_owner: string | null;
  metadata: WebOrderJson;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type WebOrderCampaign = {
  id: string;
  period_start: string;
  period_end: string;
  status: WebOrderCampaignStatus;
  created_at: string;
  updated_at: string;
};

export type WebOrder = {
  id: string;
  created_at: string;
  updated_at: string | null;
  status: WebOrderStatus;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  payment_method: string | null;
  custom_reference: string | null;
  custom_details: string | null;
  comments: string | null;
  items: WebOrderJson;
  total_estimated: number | null;
  page_lang: string | null;
  source: string | null;
  order_number: string | null;
  idempotency_key: string | null;
  campaign_id: string | null;
  member_reference: string | null;
  total_cents: number | null;
  request_hash: string | null;
};

export type WebOrderItem = {
  id: string;
  order_id: string;
  variant_id: string;
  product_name: string;
  variant_name: string;
  sku: string;
  supplier_reference: string;
  size: string;
  recipient: string | null;
  cost_cents: number;
  quantity: number;
  unit_price_cents: number;
  line_total_cents: number;
  created_at: string;
};

export type WebOrderCommunication = {
  id: string;
  order_id: string;
  channel: WebOrderCommunicationChannel;
  direction: WebOrderCommunicationDirection;
  status: "prepared" | "sending" | "sent" | "failed" | "delivered_unconfirmed";
  recipient_name: string | null;
  recipient_email: string | null;
  snapshot: WebOrderJson;
  subject: string | null;
  body: string | null;
  prepared_at: string | null;
  sent_at: string | null;
  failed_at: string | null;
  failure_message: string | null;
  attempt_token: string | null;
  attempt_started_at: string | null;
  created_by: string | null;
  created_at: string;
};

export type WebOrderFamilyPaymentStatus = "pending" | "cash_paid" | "bank_submitted";

export type WebOrderFamilyPayment = {
  id: string;
  campaign_id: string;
  family_key: string;
  recipient_name: string;
  recipient_email: string | null;
  recipient_phone: string | null;
  order_ids: string[];
  recipients: WebOrderJson;
  items: WebOrderJson;
  total_cents: number;
  intended_payment_method: "cash" | "bank" | "paid" | "mixed";
  status: WebOrderFamilyPaymentStatus;
  status_on: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};
