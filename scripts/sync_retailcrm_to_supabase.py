import os
from datetime import datetime, timezone

import requests
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

RETAILCRM_URL = os.getenv('RETAILCRM_BASE_URL', '').rstrip('/')
RETAILCRM_API_KEY = os.getenv('RETAILCRM_API_KEY', '')
SUPABASE_URL = os.getenv('NEXT_PUBLIC_SUPABASE_URL', '')
SUPABASE_SERVICE_ROLE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY', '')
TELEGRAM_BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN', '')
TELEGRAM_CHAT_ID = os.getenv('TELEGRAM_CHAT_ID', '')

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def retail_to_iso(value: str | None) -> str:
  if not value:
    return datetime.now(timezone.utc).isoformat()
  if 'T' in value:
    return datetime.fromisoformat(value.replace('Z', '+00:00')).isoformat()
  return datetime.fromisoformat(value.replace(' ', 'T')).astimezone(timezone.utc).isoformat()


def customer_label(first_name: str | None, last_name: str | None) -> str:
  first = (first_name or '').strip()
  last = (last_name or '').strip()
  if first and last:
    return f'{first} {last[0]}.'
  return first or last or 'Без имени'


def send_telegram(message: str):
  if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
    return
  response = requests.post(
    f'https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage',
    json={'chat_id': TELEGRAM_CHAT_ID, 'text': message},
    timeout=30
  )
  response.raise_for_status()


def fetch_orders() -> list[dict]:
  all_orders = []
  for page in range(1, 21):
    response = requests.get(
      f'{RETAILCRM_URL}/orders',
      params={'apiKey': RETAILCRM_API_KEY, 'page': page, 'limit': 100},
      timeout=30
    )
    response.raise_for_status()
    payload = response.json()
    page_orders = payload.get('orders', [])
    all_orders.extend(page_orders)
    if len(page_orders) < 100:
      break
  return all_orders


def sync_once():
  crm_orders = fetch_orders()
  now_iso = datetime.now(timezone.utc).isoformat()

  orders_rows = []
  dashboard_rows = []

  for order in crm_orders:
    external_id = str(order['id'])
    total = float(order.get('totalSumm') or 0)
    label = customer_label(order.get('firstName'), order.get('lastName'))
    created_at = retail_to_iso(order.get('createdAt'))
    city = order.get('delivery', {}).get('address', {}).get('city') or 'Не указан'

    base = {
      'external_id': external_id,
      'order_number': order.get('number') or external_id,
      'customer_label': label,
      'city': city,
      'total_sum': total,
      'status': order.get('status') or 'new',
      'created_at': created_at,
      'synced_at': now_iso
    }

    orders_rows.append(
      {
        **base,
        'crm_id': int(order['id']),
        'customer_name': f"{order.get('firstName', '')} {order.get('lastName', '')}".strip() or None,
        'raw_payload': order
      }
    )
    dashboard_rows.append(base)

  if orders_rows:
    supabase.table('orders').upsert(orders_rows, on_conflict='external_id').execute()
    supabase.table('dashboard_orders').upsert(dashboard_rows, on_conflict='external_id').execute()

  high_value_ids = [row['external_id'] for row in orders_rows if row['total_sum'] > 50000]
  sent = 0

  if high_value_ids:
    existing = (
      supabase.table('orders')
      .select('external_id, alert_sent_at')
      .in_('external_id', high_value_ids)
      .execute()
      .data
    )
    pending = {str(row['external_id']) for row in existing if row.get('alert_sent_at') is None}

    for row in orders_rows:
      if row['external_id'] not in pending or row['total_sum'] <= 50000:
        continue
      send_telegram(
        f"Новый крупный заказ\nID: {row['external_id']}\nСумма: {round(row['total_sum'])} ₸\nКлиент: {row['customer_label']}\nГород: {row['city']}"
      )
      (
        supabase.table('orders')
        .update({'alert_sent_at': now_iso})
        .eq('external_id', row['external_id'])
        .execute()
      )
      sent += 1

  print(f'Synced {len(orders_rows)} orders, sent {sent} alerts.')


if __name__ == '__main__':
  if not all([RETAILCRM_URL, RETAILCRM_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY]):
    raise SystemExit('Missing required environment variables.')
  sync_once()
