export type DashboardOrder = {
  external_id: string;
  order_number: string | null;
  customer_label: string | null;
  city: string | null;
  total_sum: number;
  status: string | null;
  created_at: string;
  synced_at: string;
};

export type Metrics = {
  totalOrders: number;
  totalRevenue: number;
  averageOrderValue: number;
  highValueOrders: number;
};

export type DailyPoint = {
  date: string;
  orders: number;
  revenue: number;
};

export type CityPoint = {
  city: string;
  orders: number;
};
