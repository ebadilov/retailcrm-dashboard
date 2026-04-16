'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type DashboardOrder = {
  external_id: string;
  order_number: string | null;
  customer_label: string | null;
  city: string | null;
  total_sum: number | string;
  status: string | null;
  created_at: string;
  synced_at: string;
};

type DailyPoint = {
  date: string;
  orders: number;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'KZT',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(value));
}

export default function Dashboard() {
  const [orders, setOrders] = useState<DashboardOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadOrders() {
    const { data, error } = await supabase
      .from('dashboard_orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error(error);
      setError(error.message);
      setOrders([]);
      setLoading(false);
      return;
    }

    setOrders((data as DashboardOrder[]) || []);
    setError('');
    setLoading(false);
  }

  useEffect(() => {
    loadOrders();

    const channel = supabase
      .channel('dashboard-orders')
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
    const averageCheck = totalOrders ? totalRevenue / totalOrders : 0;
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
        });
      }

      const current = grouped.get(dateKey)!;
      current.orders += 1;
    }

    return Array.from(grouped.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [orders]);

  const recentOrders = useMemo(() => orders.slice(0, 10), [orders]);

  const lastSync = orders[0]?.synced_at ? formatDate(orders[0].synced_at) : 'Нет данных';
  const maxOrder = orders.length
    ? Math.max(...orders.map((order) => toNumber(order.total_sum)))
    : 0;
  const cityCount = new Set(orders.map((order) => order.city).filter(Boolean)).size;

  if (loading) {
    return (
      <main className="page-shell">
        <section className="hero-card">
          <div>
            <div className="eyebrow">Загрузка</div>
            <h1 className="hero-title">Мини-дашборд заказов</h1>
            <p className="hero-text">Подключаем данные из Supabase и подготавливаем аналитику.</p>
          </div>
          <div className="live-pill">
            <span className="live-dot" />
            <span>Идёт загрузка данных</span>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <section className="hero-card">
        <div>
          <div className="eyebrow">RetailCRM + Supabase + Vercel</div>
          <h1 className="hero-title">Мини-дашборд заказов</h1>
          <p className="hero-text">
            Данные из RetailCRM через Supabase с обновлением в реальном времени.
          </p>
          {error ? <div className="error-box">Ошибка загрузки: {error}</div> : null}
        </div>

        <div className="live-pill pulse">
          <span className="live-dot" />
          <span>Realtime подключен</span>
        </div>
      </section>

      <section className="metrics-grid">
        <article className="metric-card">
          <div className="metric-title">Всего заказов</div>
          <div className="metric-value">{stats.totalOrders}</div>
          <div className="metric-subtitle">Все заказы из витрины dashboard_orders</div>
        </article>

        <article className="metric-card">
          <div className="metric-title">Общая выручка</div>
          <div className="metric-value">{formatMoney(stats.totalRevenue)}</div>
          <div className="metric-subtitle">Сумма по всем загруженным заказам</div>
        </article>

        <article className="metric-card">
          <div className="metric-title">Средний чек</div>
          <div className="metric-value">{formatMoney(stats.averageCheck)}</div>
          <div className="metric-subtitle">Среднее значение заказа</div>
        </article>

        <article className="metric-card">
          <div className="metric-title">Заказы свыше 50 000 ₸</div>
          <div className="metric-value">{stats.bigOrders}</div>
          <div className="metric-subtitle">Используется для Telegram-уведомлений</div>
        </article>
      </section>

      <section className="charts-grid">
        <article className="panel-card chart-panel">
          <div className="panel-header">
            <div>
              <h2>Динамика заказов</h2>
              <p>Количество заказов по дням</p>
            </div>
          </div>

          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyData}>
                <CartesianGrid stroke="rgba(167, 182, 211, 0.12)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#a7b6d3', fontSize: 12 }}
                  tickFormatter={(value) => formatShortDate(`${value}T00:00:00.000Z`)}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#a7b6d3', fontSize: 12 }}
                  allowDecimals={false}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(10, 18, 34, 0.96)',
                    border: '1px solid rgba(167, 182, 211, 0.16)',
                    borderRadius: 16,
                    color: '#eef4ff',
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
        </article>

        <article className="panel-card">
          <div className="panel-header">
            <div>
              <h2>Сводка</h2>
              <p>Ключевые показатели по витрине</p>
            </div>
          </div>

          <div className="metric-subtitle">Городов в выборке</div>
          <div className="metric-value">{cityCount}</div>

          <div className="metric-subtitle" style={{ marginTop: 20 }}>Последняя синхронизация</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 8 }}>{lastSync}</div>

          <div className="metric-subtitle" style={{ marginTop: 20 }}>Максимальный заказ</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 8 }}>
            {formatMoney(maxOrder)}
          </div>
        </article>
      </section>

      <section className="panel-card table-panel">
        <div className="panel-header">
          <div>
            <h2>Последние заказы</h2>
            <p>Последние 10 записей из витрины dashboard_orders</p>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Номер</th>
                <th>Клиент</th>
                <th>Город</th>
                <th>Сумма</th>
                <th>Статус</th>
                <th>Дата</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.length === 0 ? (
                <tr>
                  <td colSpan={6}>Заказы не найдены</td>
                </tr>
              ) : (
                recentOrders.map((order) => (
                  <tr key={order.external_id}>
                    <td>{order.order_number || order.external_id}</td>
                    <td>{order.customer_label || 'Без имени'}</td>
                    <td>{order.city || 'Не указан'}</td>
                    <td>{formatMoney(toNumber(order.total_sum))}</td>
                    <td>
                      <span className="status-chip">{order.status || 'new'}</span>
                    </td>
                    <td>{formatDate(order.created_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
