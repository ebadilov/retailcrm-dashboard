# RetailCRM Mini Dashboard

Готовый MVP для тестового задания:
- импорт mock-заказов в RetailCRM;
- синк RetailCRM -> Supabase;
- красивый дашборд на Next.js;
- realtime-обновления через Supabase Realtime;
- авто-уведомления в Telegram для заказов > 50 000 ₸;
- cron на Vercel каждые 5 минут.

## 1) Стек
- Next.js App Router
- Supabase (Postgres + Realtime)
- Vercel Cron Jobs
- Telegram Bot API
- Python-скрипты для локального импорта и проверки

## 2) Подготовка Supabase
1. Открой SQL Editor.
2. Выполни `supabase/schema.sql`.
3. Возьми:
   - Project URL
   - anon key
   - service_role key

## 3) Переменные окружения
Скопируй `.env.example` в `.env.local`:

```bash
cp .env.example .env
```

Заполни переменные.

## 4) Локальный запуск
```bash
npm install
npm run dev
```

Открой `http://localhost:3000`.

## 5) Импорт mock_orders.json в RetailCRM
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python scripts/import_mock_orders.py ./mock_orders.json
```

Если твой `mock_orders.json` уже почти в формате RetailCRM, скрипт подхватит существующие поля. Если структура другая, поправь `build_retailcrm_order()`.

## 6) Локальная синхронизация
```bash
python scripts/sync_retailcrm_to_supabase.py
```

## 7) Деплой на Vercel
```bash
npm i -g vercel
vercel
vercel --prod
```

После этого:
1. Добавь все переменные из `.env.example` в Project Settings -> Environment Variables.
2. Убедись, что `CRON_SECRET` тоже добавлен.
3. Заново сделай `vercel --prod`, чтобы cron применился.

## 8) Проверка cron
Эндпоинт:
```text
/api/cron/sync
```

Cron вызывается каждые 5 минут по `vercel.json`.

## 9) Что важно по безопасности
- Никогда не коммить `service_role` key, `RetailCRM API key`, `Telegram bot token`.
- Ключи, которые были засвечены, перевыпусти.
- В клиентский код отдаётся только `NEXT_PUBLIC_SUPABASE_URL` и `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Реальные сырые заказы хранятся в таблице `orders`, а публичный UI читает только `dashboard_orders`.

## 10) Что отдавать как результат тестового
- ссылка на Vercel
- ссылка на GitHub
- скрин уведомления Telegram
- короткое описание архитектуры: RetailCRM -> Vercel cron -> Supabase -> realtime dashboard
