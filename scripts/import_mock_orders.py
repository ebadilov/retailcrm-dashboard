import json
import os
import sys
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv()

RETAILCRM_URL = os.getenv("RETAILCRM_BASE_URL", "").rstrip("/")
RETAILCRM_API_KEY = os.getenv("RETAILCRM_API_KEY", "")
RETAILCRM_SITE = os.getenv("RETAILCRM_SITE", "demo")


def load_orders(path: str) -> list[dict]:
    payload = json.loads(Path(path).read_text(encoding="utf-8"))

    if isinstance(payload, list):
        return payload

    if isinstance(payload, dict) and isinstance(payload.get("orders"), list):
        return payload["orders"]

    raise ValueError('mock_orders.json must be a list or an object with "orders" list')


def build_retailcrm_order(source: dict, index: int) -> dict:
    total = float(
        source.get("totalSumm")
        or source.get("total_sum")
        or source.get("amount")
        or source.get("total")
        or 0
    )

    customer = source.get("customer") or {}
    delivery = source.get("delivery") or {}
    address = delivery.get("address") or source.get("address") or {}

    first_name = (
        source.get("firstName")
        or source.get("first_name")
        or customer.get("first_name")
        or f"Customer{index}"
    )
    last_name = (
        source.get("lastName")
        or source.get("last_name")
        or customer.get("last_name")
        or "Demo"
    )
    city = source.get("city") or address.get("city") or "Алматы"

    items = source.get("items")
    if not items:
        items = [
            {
                "offer": {"externalId": f"sku-{index:03d}"},
                "productName": source.get("productName", f"Test product #{index}"),
                "quantity": 1,
                "initialPrice": max(total, 1000),
            }
        ]

    order = {
        "externalId": str(
            source.get("externalId")
            or source.get("external_id")
            or source.get("id")
            or index
        ),
        "number": str(source.get("number") or f"MOCK-{index:03d}"),
        "firstName": first_name,
        "lastName": last_name,
        "phone": source.get("phone") or "+77000000000",
        "email": source.get("email") or f"mock{index}@example.com",
        "countryIso": source.get("countryIso") or "KZ",
        "customerComment": source.get("customerComment") or "Imported from mock_orders.json",
        "createdAt": source.get("createdAt")
        or source.get("created_at")
        or time.strftime("%Y-%m-%d %H:%M:%S"),
        "totalSumm": total,
        "delivery": {
            "address": {
                "city": city,
                "text": source.get("address_text") or f"{city}, demo street 1",
            }
        },
        "items": items,
    }

    return order

def create_order(order_data: dict) -> dict:
    url = f"{RETAILCRM_URL}/orders/create"

    request_data = {
        "apiKey": RETAILCRM_API_KEY,
        "site": RETAILCRM_SITE,
        "order": json.dumps(order_data, ensure_ascii=False),
    }

    resp = requests.post(url, data=request_data, timeout=30)

    if not resp.ok:
        raise RuntimeError(f"{resp.status_code}: {resp.text}")

    response_data = resp.json()

    if response_data.get("success") is False:
        raise RuntimeError(response_data.get("errorMsg") or str(response_data))

    return response_data


def main() -> None:
    if not RETAILCRM_URL or not RETAILCRM_API_KEY:
        raise SystemExit("Set RETAILCRM_BASE_URL and RETAILCRM_API_KEY in .env")

    path = sys.argv[1] if len(sys.argv) > 1 else "mock_orders.json"
    orders = load_orders(path)

    created = 0

    for index, source in enumerate(orders, start=1):
        retail_order = build_retailcrm_order(source, index)

        try:
            create_order(retail_order)
            created += 1
            print(f'Created order {retail_order["number"]}')
            time.sleep(0.15)
        except Exception as exc:
            print(f'Failed to create order {retail_order["number"]}: {exc}')

    print(f"Done. Created {created} of {len(orders)} orders.")


if __name__ == "__main__":
    main()