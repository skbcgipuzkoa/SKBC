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
  image_url: string | null;
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
  unit_price_cents: number;
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
  subject: string | null;
  body: string;
  created_by: string | null;
  created_at: string;
};
