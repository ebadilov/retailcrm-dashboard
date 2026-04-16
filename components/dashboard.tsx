'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { createClient } from '@supabase/supabase-js';

type DashboardOrder = {
  external_id: string;
  order_number: string | null;
  customer_label: string | null;
  city: string | null;
  total_sum: number;
  status: string | null;
  created_at: string;
  synced_at: string;
};

type DailyPoint = {
  date: string;
  orders: number;
  revenue: number;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

function formatMoney(value: number) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'KZT',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(value));
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export default function Dashboard() {
  const [orders, setOrders] = useState<DashboardOrder[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadOrders() {
    const { data, error } = await supabase
      .from('dashboard_orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to load orders:', error);
      setOrders([]);
      setLoading(false);
      return;
    }

    setOrders((data as DashboardOrder[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    loadOrders();

    const channel = supabase
      .channel('dashboard-orders-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'dashboard_orders',
        },
        () => {
          loadOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const stats = useMemo(() => {
    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((sum, order) => sum + toNumber(order.total_sum), 0);
    const averageCheck = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    const bigOrders = orders.filter((order) => toNumber(order.total_sum) > 50000).length;

    return {
      totalOrders,
      totalRevenue,
      averageCheck,
      bigOrders,
    };
  }, [orders]);

  const dailyData = useMemo<DailyPoint[]>(() => {
    const grouped = new Map<string, DailyPoint>();

    for (const order of orders) {
      const dateKey = new Date(order.created_at).toISOString().slice(0, 10);

      if (!grouped.has(dateKey)) {
        grouped.set(dateKey, {
          date: dateKey,
          orders: 0,
          revenue: 0,
        });
      }

      const current = grouped.get(dateKey)!;
      current.orders += 1;
      current.revenue += toNumber(order.total_sum);
    }

    return Array.from(grouped.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [orders]);

  const recentOrders = useMemo(() => orders.slice(0, 10), [orders]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="text-lg">Загрузка дашборда...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Мини-дашборд заказов</h1>
          <p className="mt-2 text-slate-400">
            Данные из RetailCRM через Supabase с обновлением в реальном времени
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 mb-8">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-sm">
            <div className="text-sm text-slate-400">Всего заказов</div>
            <div className="mt-2 text-3xl font-semibold">{stats.totalOrders}</div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-sm">
            <div className="text-sm text-slate-400">Общая выручка</div>
            <div className="mt-2 text-3xl font-semibold">{formatMoney(stats.totalRevenue)}</div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-sm">
            <div className="text-sm text-slate-400">Средний чек</div>
            <div className="mt-2 text-3xl font-semibold">{formatMoney(stats.averageCheck)}</div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-sm">
            <div className="text-sm text-slate-400">Заказы свыше 50 000 ₸</div>
            <div className="mt-2 text-3xl font-semibold">{stats.bigOrders}</div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2 rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="mb-4">
              <h2 className="text-xl font-semibold">Динамика заказов</h2>
              <p className="text-sm text-slate-400">
                Количество заказов по дням
              </p>
            </div>

            <div className="h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailyData}>
                  <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: '#cbd5e1', fontSize: 12 }}
                    tickFormatter={(value) => formatShortDate(`${value}T00:00:00.000Z`)}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#cbd5e1', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#0f172a',
                      border: '1px solid rgba(167, 182, 255, 0.18)',
                      borderRadius: 14,
                    }}
                    labelStyle={{ color: '#eef4ff' }}
                    formatter={(value) => [Number(value ?? 0), 'Заказы']}
                    labelFormatter={(label) => formatDate(`${label}T00:00:00.000Z`)}
                  />
                  <Line
                    type="monotone"
                    dataKey="orders"
                    stroke="#7dd3fc"
                    strokeWidth={3}
                    dot={false}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="mb-4">
              <h2 className="text-xl font-semibold">Последние заказы</h2>
              <p className="text-sm text-slate-400">
                Последние 10 записей из витрины dashboard_orders
              </p>
            </div>

            <div className="space-y-3">
              {recentOrders.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-700 p-6 text-sm text-slate-400">
                  Заказы пока не найдены
                </div>
              ) : (
                recentOrders.map((order) => (
                  <div
                    key={order.external_id}
                    className="rounded-xl border border-slate-800 bg-slate-950/60 p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="font-medium text-slate-100">
                          {order.order_number || order.external_id}
                        </div>
                        <div className="mt-1 text-sm text-slate-400">
                          {order.customer_label || 'Без имени клиента'}
                        </div>
                      </div>
                      <div className="text-sm font-semibold text-sky-300">
                        {formatMoney(toNumber(order.total_sum))}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-400">
                      <span className="rounded-full bg-slate-800 px-2 py-1">
                        {order.city || 'Город не указан'}
                      </span>
                      <span className="rounded-full bg-slate-800 px-2 py-1">
                        {order.status || 'Без статуса'}
                      </span>
                      <span className="rounded-full bg-slate-800 px-2 py-1">
                        {formatDate(order.created_at)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <div className="mb-4">
            <h2 className="text-xl font-semibold">Сводка</h2>
            <p className="text-sm text-slate-400">
              Базовая аналитика по витрине заказов
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-xl bg-slate-950/60 p-4">
              <div className="text-sm text-slate-400">Городов в выборке</div>
              <div className="mt-2 text-2xl font-semibold">
                {new Set(orders.map((o) => o.city).filter(Boolean)).size}
              </div>
            </div>

            <div className="rounded-xl bg-slate-950/60 p-4">
              <div className="text-sm text-slate-400">Последняя синхронизация</div>
              <div className="mt-2 text-2xl font-semibold">
                {orders[0]?.synced_at ? formatDate(orders[0].synced_at) : 'Нет данных'}
              </div>
            </div>

            <div className="rounded-xl bg-slate-950/60 p-4">
              <div className="text-sm text-slate-400">Максимальный заказ</div>
              <div className="mt-2 text-2xl font-semibold">
                {formatMoney(
                  orders.length
                    ? Math.max(...orders.map((o) => toNumber(o.total_sum)))
                    : 0
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
