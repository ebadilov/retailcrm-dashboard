'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { formatCurrency, formatDate, formatDateTime, formatDay } from '@/lib/format';
import type { CityPoint, DailyPoint, DashboardOrder, Metrics } from '@/lib/types';

function buildMetrics(orders: DashboardOrder[]): Metrics {
  const totalRevenue = orders.reduce((sum, order) => sum + Number(order.total_sum || 0), 0);
  const highValueOrders = orders.filter((order) => Number(order.total_sum) > 50000).length;

  return {
    totalOrders: orders.length,
    totalRevenue,
    averageOrderValue: orders.length ? totalRevenue / orders.length : 0,
    highValueOrders
  };
}

function buildDailyPoints(orders: DashboardOrder[]): DailyPoint[] {
  const byDay = new Map<string, { orders: number; revenue: number }>();

  for (const order of orders) {
    const key = new Date(order.created_at).toISOString().slice(0, 10);
    const current = byDay.get(key) ?? { orders: 0, revenue: 0 };
    current.orders += 1;
    current.revenue += Number(order.total_sum || 0);
    byDay.set(key, current);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-14)
    .map(([date, values]) => ({
      date,
      orders: values.orders,
      revenue: values.revenue
    }));
}

function buildCityPoints(orders: DashboardOrder[]): CityPoint[] {
  const byCity = new Map<string, number>();

  for (const order of orders) {
    const city = order.city?.trim() || 'Не указан';
    byCity.set(city, (byCity.get(city) ?? 0) + 1);
  }

  return [...byCity.entries()]
    .map(([city, orders]) => ({ city, orders }))
    .sort((a, b) => b.orders - a.orders)
    .slice(0, 7);
}

function MetricCard({ title, value, subtitle }: { title: string; value: string; subtitle: string }) {
  return (
    <div className="metric-card">
      <div className="metric-title">{title}</div>
      <div className="metric-value">{value}</div>
      <div className="metric-subtitle">{subtitle}</div>
    </div>
  );
}

export function Dashboard() {
  const [orders, setOrders] = useState<DashboardOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadOrders() {
      const { data, error } = await supabaseBrowser
        .from('dashboard_orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(300);

      if (cancelled) return;

      if (error) {
        setError(error.message);
      } else {
        setOrders((data ?? []) as DashboardOrder[]);
        setLastUpdated(new Date());
      }

      setLoading(false);
    }

    void loadOrders();

    const channel = supabaseBrowser
      .channel('dashboard-orders-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'dashboard_orders' },
        async () => {
          const { data } = await supabaseBrowser
            .from('dashboard_orders')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(300);

          setOrders((data ?? []) as DashboardOrder[]);
          setLastUpdated(new Date());
          setPulse(true);
          window.setTimeout(() => setPulse(false), 1200);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabaseBrowser.removeChannel(channel);
    };
  }, []);

  const metrics = useMemo(() => buildMetrics(orders), [orders]);
  const dailyPoints = useMemo(() => buildDailyPoints(orders), [orders]);
  const cityPoints = useMemo(() => buildCityPoints(orders), [orders]);
  const recentOrders = useMemo(() => orders.slice(0, 10), [orders]);

  return (
    <main className="page-shell">
      <section className="hero-card">
        <div>
          <div className="eyebrow">RetailCRM × Supabase × Vercel</div>
          <h1 className="hero-title">Мини-дашборд заказов</h1>
          <p className="hero-text">
            Данные подтягиваются из Supabase, а интерфейс подписан на обновления таблицы в реальном времени.
          </p>
        </div>
        <div className={`live-pill ${pulse ? 'pulse' : ''}`}>
          <span className="live-dot" />
          <span>{lastUpdated ? `Обновлено ${lastUpdated.toLocaleTimeString('ru-RU')}` : 'Ожидание данных'}</span>
        </div>
      </section>

      {error ? <div className="error-box">Ошибка загрузки: {error}</div> : null}

      <section className="metrics-grid">
        <MetricCard
          title="Всего заказов"
          value={loading ? '…' : String(metrics.totalOrders)}
          subtitle="Общее количество синхронизированных заказов"
        />
        <MetricCard
          title="Оборот"
          value={loading ? '…' : formatCurrency(metrics.totalRevenue)}
          subtitle="Сумма всех заказов в витрине"
        />
        <MetricCard
          title="Средний чек"
          value={loading ? '…' : formatCurrency(metrics.averageOrderValue)}
          subtitle="Средняя сумма заказа"
        />
        <MetricCard
          title="Крупные заказы"
          value={loading ? '…' : String(metrics.highValueOrders)}
          subtitle="Заказы свыше 50 000 ₸"
        />
      </section>

      <section className="charts-grid">
        <div className="panel-card chart-panel">
          <div className="panel-header">
            <div>
              <h2>Динамика заказов</h2>
              <p>Последние 14 дней</p>
            </div>
          </div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyPoints}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(167, 182, 211, 0.16)" />
                <XAxis dataKey="date" tickFormatter={formatDay} tickLine={false} axisLine={false} tick={{ fill: '#a7b6d3', fontSize: 12 }} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: '#a7b6d3', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ background: '#0f172a', border: '1px solid rgba(167, 182, 211, 0.16)', borderRadius: 14 }}
                  labelStyle={{ color: '#eef4ff' }}
                  formatter={(value: number) => [value, 'Заказы']}
                  labelFormatter={(label) => formatDate(`${label}T00:00:00.000Z`)}
                />
                <Line type="monotone" dataKey="orders" stroke="#7dd3fc" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel-card chart-panel">
          <div className="panel-header">
            <div>
              <h2>Заказы по городам</h2>
              <p>Топ направлений доставки</p>
            </div>
          </div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cityPoints} layout="vertical" margin={{ left: 8, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(167, 182, 211, 0.16)" />
                <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: '#a7b6d3', fontSize: 12 }} />
                <YAxis dataKey="city" type="category" width={90} tickLine={false} axisLine={false} tick={{ fill: '#a7b6d3', fontSize: 12 }} />
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid rgba(167, 182, 211, 0.16)', borderRadius: 14 }} labelStyle={{ color: '#eef4ff' }} formatter={(value: number) => [value, 'Заказы']} />
                <Bar dataKey="orders" fill="#a78bfa" radius={[10, 10, 10, 10]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="panel-card table-panel">
        <div className="panel-header">
          <div>
            <h2>Последние заказы</h2>
            <p>Витрина из безопасной публичной таблицы dashboard_orders</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Номер</th>
                <th>Клиент</th>
                <th>Город</th>
                <th>Статус</th>
                <th>Сумма</th>
                <th>Создан</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((order) => (
                <tr key={order.external_id}>
                  <td>{order.order_number || order.external_id}</td>
                  <td>{order.customer_label || '—'}</td>
                  <td>{order.city || '—'}</td>
                  <td>
                    <span className="status-chip">{order.status || 'new'}</span>
                  </td>
                  <td>{formatCurrency(Number(order.total_sum || 0))}</td>
                  <td>{formatDateTime(order.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
