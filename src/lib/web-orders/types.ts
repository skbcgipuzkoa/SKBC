export type WebOrderProductCategory = "dogi" | "belt" | "club_clothing" | "other";
export type WebOrderCampaignStatus = "open" | "pending_close" | "closed";
export type WebOrderStatus =
  | "pending"
  | "seen"
  | "contacted"
  | "payment_pending"
  | "paid"
  | "delivered"
  | "cancelled";
export type WebOrderPaymentMethod = "cash" | "bank" | "paid";
export type WebOrderCommunicationStatus = "prepared" | "sent" | "failed";

export type WebOrderProduct = {
  id: string;
  supplier: string;
  supplier_reference: string;
  name: string;
  category: WebOrderProductCategory;
  description: string | null;
  level: string | null;
  weight: string | null;
  image_url: string | null;
  active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
};

export type WebOrderVariant = {
  id: string;
  product_id: string;
  sku: string;
  size: string;
  cost_cents: number;
  margin_cents: number;
  price_cents: number;
  promotional_price_cents: number | null;
  promotion_starts_at: string | null;
  promotion_ends_at: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type WebOrderCampaign = {
  id: string;
  label: string;
  starts_on: string;
  ends_on: string;
  status: WebOrderCampaignStatus;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type WebOrder = {
  id: string;
  order_number: string | null;
  campaign_id: string | null;
  idempotency_key: string | null;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string;
  member_reference: string | null;
  comments: string | null;
  page_lang: string;
  source: string;
  status: WebOrderStatus;
  payment_method: WebOrderPaymentMethod | null;
  total_cents: number | null;
  created_at: string;
  updated_at: string | null;
};

export type WebOrderItem = {
  id: string;
  order_id: string;
  variant_id: string;
  recipient: string;
  product_name: string;
  supplier_reference: string;
  sku: string;
  size: string;
  quantity: number;
  unit_cost_cents: number;
  unit_price_cents: number;
  total_price_cents: number;
  created_at: string;
};

export type WebOrderCommunication = {
  id: string;
  campaign_id: string;
  order_id: string;
  recipient_email: string;
  subject: string;
  html_body: string;
  status: WebOrderCommunicationStatus;
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};
