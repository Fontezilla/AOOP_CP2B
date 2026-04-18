import argparse
import re
import time
import uuid
from datetime import datetime, timezone

import requests
from bs4 import BeautifulSoup
from supabase import create_client, Client
import os
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SECRET_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

BASE_URL = "https://edax.pt/viaturas/"

HEADERS = {
    "User-Agent": "Mozilla/5.0"
}


def fetch(url, delay=1.0):
    try:
        resp = requests.get(url, headers=HEADERS, timeout=20)
        resp.raise_for_status()
        time.sleep(delay)
        return BeautifulSoup(resp.text, "html.parser")
    except requests.RequestException as e:
        print("  [ERRO] {} -> {}".format(url, e))
        return None


def clean_int(text):
    digits = re.sub(r"[^\d]", "", text)
    return int(digits) if digits else None


def clean_price(text):
    cleaned = re.sub(r"[^\d,.]", "", text)
    cleaned = cleaned.replace(".", "").replace(",", ".")
    try:
        return float(cleaned)
    except ValueError:
        return None


def parse_year(text):
    m = re.search(r"\b(19|20)\d{2}\b", text)
    return int(m.group()) if m else None


def parse_brand_model(title):
    parts = title.strip().split(None, 1)
    brand = parts[0] if parts else title
    model = parts[1] if len(parts) > 1 else ""
    return brand, model


def parse_listing_page(soup):
    cars = []
    items = soup.find_all("li", class_="brxe-kxywon")

    for li in items:
        main_link = li.find("a", class_="brxe-dbdb59")
        if not main_link:
            continue

        url = main_link.get("href", "")
        if not url:
            continue

        image_url = ""
        img = li.find("img")
        if img:
            for attr in ("data-src", "src"):
                val = img.get(attr, "")
                if val and not val.startswith("data:"):
                    image_url = val
                    break

        h3 = main_link.find("h3", class_="brxe-fe4b0d")
        title_base = h3.get_text(strip=True) if h3 else ""

        full_title = title_base.strip()
        brand, model = parse_brand_model(title_base)

        year_tag = main_link.find("span", class_="brxe-44374e")
        year = parse_year(year_tag.get_text(strip=True)) if year_tag else None

        fuel_tag = main_link.find("span", class_="brxe-e0be6c")
        fuel = fuel_tag.get_text(strip=True) if fuel_tag else ""

        mileage_tag = main_link.find("span", class_="brxe-a227ef")
        mileage = clean_int(mileage_tag.get_text(strip=True)) if mileage_tag else None

        price_tag = main_link.find("div", class_="brxe-5b8656")
        price = clean_price(price_tag.get_text(strip=True)) if price_tag else None

        cars.append({
            "id": str(uuid.uuid4()),
            "title": full_title,
            "brand": brand,
            "model": model,
            "price": price,
            "year": year,
            "mileage": mileage,
            "fuel": fuel,
            "image_url": image_url,
            "url": url,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

    return cars


def get_total_pages(soup):
    trail = soup.find("li", class_="brx-query-trail")
    if trail:
        try:
            return int(trail.get("data-max-pages", 1))
        except:
            pass
    return 1


def save_to_db(cars):
    if not cars:
        return

    try:
        response = supabase.table("cars").upsert(
            cars,
            on_conflict="url"
        ).execute()

        print(f"Guardados/atualizados {len(cars)} carros")

    except Exception as e:
        print("Erro ao guardar na BD:", e)


def scrape_loop(delay=1.0, interval=300):
    while True:

        soup = fetch(BASE_URL, delay)
        if not soup:
            print("Erro ao obter página.")
            continue

        total_pages = get_total_pages(soup)
        print(f"Total páginas: {total_pages}")

        seen_urls = set()

        for page in range(1, total_pages + 1):
            if page == 1:
                page_soup = soup
            else:
                url = f"{BASE_URL}?_pagina={page}"
                print(f"Página {page}")
                page_soup = fetch(url, delay)
                if not page_soup:
                    continue

            cars = parse_listing_page(page_soup)

            unique = [c for c in cars if c["url"] not in seen_urls]
            for c in unique:
                seen_urls.add(c["url"])

            save_to_db(unique)

        print(f"Scraping completo. Esperar {interval}s...")
        time.sleep(interval)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--delay", type=float, default=1.0)
    parser.add_argument("--interval", type=int, default=300)
    args = parser.parse_args()

    scrape_loop(delay=args.delay, interval=args.interval)


if __name__ == "__main__":
    main()