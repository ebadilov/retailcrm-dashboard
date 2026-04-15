import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

type RetailCrmOrder = {
  id?: number | string;
  number?: string;
  firstName?: string;
  lastName?: string;
  status?: string;
  totalSumm?: number | string;
  createdAt?: string;
  customerComment?: string;
  phone?: string;
  delivery?: {
    address?: {
      city?: string;
    };
  };
};

type OrdersResponse = {
  success?: boolean;
  orders?: RetailCrmOrder[];
  pagination?: {
    currentPage?: number;
    totalPageCount?: number;
  };
  errorMsg?: string;
};

function normalizeCustomerLabel(firstName?: string, lastName?: string) {
  const first = (firstName || '').trim();
  const last = (lastName || '').trim();

  if (!first && !last) return 'Без имени';
  if (first && !last) return first;
  if (!first && last) return `${last[0]}.`;

  return `${first} ${last[0]}.`;
}

function parseRetailDate(value?: string) {
  if (!value) return new Date().toISOString();
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

async function fetchRetailOrdersPage(page: number, limit = 100): Promise<RetailCrmOrder[]> {
  const crmBaseUrl = process.env.RETAILCRM_URL;
  const apiKey = process.env.RETAILCRM_API_KEY;

  if (!crmBaseUrl || !apiKey) {
    throw new Error('RETAILCRM_URL or RETAILCRM_API_KEY is missing');
  }

  const url = new URL(`${crmBaseUrl.replace(/\/$/, '')}/orders`);
  url.searchParams.set('apiKey', apiKey);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('page', String(page));

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Accept: 'application/json'
    },
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(`RetailCRM returned ${response.status}`);
  }

  const payload = (await response.json()) as OrdersResponse;

  if (payload.success === false) {
    throw new Error(payload.errorMsg || 'RetailCRM API error');
  }

  return payload.orders ?? [];
}

async function fetchAllRetailOrders() {
  const pageSize = 100;
  const all: RetailCrmOrder[] = [];

  for (let page = 1; page <= 20; page += 1) {
    const pageOrders = await fetchRetailOrdersPage(page, pageSize);
    all.push(...pageOrders);

    if (pageOrders.length < pageSize) {
      break;
    }
  }

  return all;
}

async function sendTelegram(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) return;

  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      chat_id: chatId,
      text
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram error: ${body}`);
  }
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const supabase = createServiceSupabase();

  try {
    const retailOrders = await fetchAllRetailOrders();

    const ordersRows = retailOrders
      .filter((order) => order.id !== undefined && order.id !== null)
      .map((order) => {
        const total = Number(order.totalSumm || 0);
        const customerLabel = normalizeCustomerLabel(order.firstName, order.lastName);
        const createdAt = parseRetailDate(order.createdAt);
        const externalId = String(order.id);

        return {
          external_id: externalId,
          crm_id: Number(order.id),
          order_number: order.number || externalId,
          customer_name: `${order.firstName || ''} ${order.lastName || ''}`.trim() || null,
          customer_label: customerLabel,
          total_sum: Number.isFinite(total) ? total : 0,
          city: order.delivery?.address?.city || 'Не указан',
          status: order.status || 'new',
          created_at: createdAt,
          raw_payload: order,
          synced_at: new Date().toISOString()
        };
      });

    if (ordersRows.length > 0) {
      const { error: ordersError } = await supabase.from('orders').upsert(ordersRows, {
        onConflict: 'external_id'
      });

      if (ordersError) throw ordersError;

      const dashboardRows = ordersRows.map((row) => ({
        external_id: row.external_id,
        order_number: row.order_number,
        customer_label: row.customer_label,
        city: row.city,
        total_sum: row.total_sum,
        status: row.status,
        created_at: row.created_at,
        synced_at: row.synced_at
      }));

      const { error: dashboardError } = await supabase.from('dashboard_orders').upsert(dashboardRows, {
        onConflict: 'external_id'
      });

      if (dashboardError) throw dashboardError;
    }

    const highValueOrders = ordersRows.filter((row) => row.total_sum > 50000);
    const highValueIds = highValueOrders.map((row) => row.external_id);

    let pendingAlerts = new Set<string>();

    if (highValueIds.length > 0) {
      const { data: existingAlerts, error: alertsQueryError } = await supabase
        .from('orders')
        .select('external_id, alert_sent_at')
        .in('external_id', highValueIds);

      if (alertsQueryError) throw alertsQueryError;

      pendingAlerts = new Set(
        (existingAlerts ?? [])
          .filter((row) => row.alert_sent_at === null)
          .map((row) => String(row.external_id))
      );
    }

    const sentIds: string[] = [];

    for (const row of highValueOrders) {
      if (!pendingAlerts.has(row.external_id)) continue;

      await sendTelegram(
        `Новый крупный заказ\nID: ${row.external_id}\nСумма: ${Math.round(row.total_sum)} ₸\nКлиент: ${row.customer_label}\nГород: ${row.city}`
      );

      const { error: updateAlertError } = await supabase
        .from('orders')
        .update({ alert_sent_at: new Date().toISOString() })
        .eq('external_id', row.external_id);

      if (updateAlertError) throw updateAlertError;
      sentIds.push(row.external_id);
    }

    return NextResponse.json({
      ok: true,
      synced: ordersRows.length,
      alerts_sent: sentIds.length,
      alerted_order_ids: sentIds
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      {
        ok: false,
        error: message
      },
      { status: 500 }
    );
  }
}
