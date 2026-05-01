import argparse
import re
import time
import uuid
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed

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

SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "Mozilla/5.0"})


def fetch(url, delay=0.5):
    try:
        resp = SESSION.get(url, timeout=20)
        resp.raise_for_status()
        time.sleep(delay)
        return BeautifulSoup(resp.text, "html.parser")
    except requests.RequestException as e:
        print(f"  [ERRO] {url} -> {e}")
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


def parse_listing_page(soup, page_number):
    print(f"A processar página {page_number}...")
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
            "title": title_base.strip(),
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


def parse_detail_page(soup):
    details = {}

    field_map = {
        "Marca:": "brand",
        "Modelo:": "model",
        "Mês/Ano:": "month_year",
        "Quilometragem:": "mileage_raw",
        "Transmissão:": "transmission",
        "Cilindrada:": "cilindrada",
        "Potência:": "power",
        "Cor Exterior:": "color",
        "Núm de Portas:": "doors",
        "Núm de Lugares:": "seats",
        "Combustível:": "fuel",
        "Tracção:": "traction",
        "Secção:": "section",
        "Tipo de Veiculo:": "vehicle_type",
    }

    spec_list = soup.find("ul", id="brxe-cpfevl")
    if spec_list:
        for li in spec_list.find_all("li"):
            label_tag = li.find("p")
            value_tag = li.find("span")
            if not label_tag or not value_tag:
                continue
            label = label_tag.get_text(strip=True)
            value = value_tag.get_text(strip=True)
            key = field_map.get(label)
            if key:
                details[key] = value

    price_tag = soup.find(id="brxe-zjvits")
    if price_tag:
        details["price"] = clean_price(price_tag.get_text(strip=True))

    img_tag = soup.find("a", class_="bricks-lightbox")
    if img_tag:
        details["image_url"] = img_tag.get("href") or img_tag.get("data-pswp-src", "")

    if "month_year" in details:
        parts = details["month_year"].split("/")
        if len(parts) == 2:
            details["month"] = parts[0].strip()
            details["year"] = parse_year(parts[1].strip())
        del details["month_year"]

    if "mileage_raw" in details:
        details["mileage"] = clean_int(details.pop("mileage_raw"))

    if "power" in details:
        details["power_cv"] = clean_int(details.pop("power"))

    for field in ("doors", "seats"):
        if field in details:
            details[field] = clean_int(details[field])

    return details


def fetch_and_enrich(car, delay, index, total):
    print(f"[{index}/{total}] A extrair: {car['url']}")
    detail_soup = fetch(car["url"], delay)
    if detail_soup:
        car.update(parse_detail_page(detail_soup))
    return car


def get_total_pages(soup):
    trail = soup.find("li", class_="brx-query-trail")
    if trail:
        try:
            return int(trail.get("data-max-pages", 1))
        except:
            pass
    return 1


def fetch_page(page, delay):
    url = BASE_URL if page == 1 else f"{BASE_URL}?_pagina={page}"
    return fetch(url, delay)


def save_to_db(cars):
    if not cars:
        return
    try:
        supabase.table("cars").upsert(cars, on_conflict="url").execute()
        print(f"  Guardados/atualizados {len(cars)} carros")
    except Exception as e:
        print(f"  Erro ao guardar na BD: {e}")


def scrape_loop(delay=0.5, interval=300, workers=8):
    while True:
        first_soup = fetch(BASE_URL, delay)
        if not first_soup:
            print("Erro ao obter página inicial.")
            time.sleep(30)
            continue

        total_pages = get_total_pages(first_soup)
        print(f"Total páginas: {total_pages}")

        all_soups = {1: first_soup}
        pages_to_fetch = list(range(2, total_pages + 1))

        with ThreadPoolExecutor(max_workers=workers) as ex:
            future_to_page = {ex.submit(fetch_page, p, delay): p for p in pages_to_fetch}
            for future in as_completed(future_to_page):
                p = future_to_page[future]
                result = future.result()
                if result:
                    all_soups[p] = result

        seen_urls = set()
        unique_cars = []

        for p in range(1, total_pages + 1):
            page_soup = all_soups.get(p)
            if not page_soup:
                continue

            cars = parse_listing_page(page_soup, p)

            for car in cars:
                if car["url"] not in seen_urls:
                    seen_urls.add(car["url"])
                    unique_cars.append(car)

        total_cars = len(unique_cars)
        print(f"Total viaturas únicas encontradas: {total_cars}")

        enriched = []
        with ThreadPoolExecutor(max_workers=workers) as ex:
            futures = {
                ex.submit(fetch_and_enrich, car, delay, i + 1, total_cars): car
                for i, car in enumerate(unique_cars)
            }

            for future in as_completed(futures):
                result = future.result()
                if result:
                    enriched.append(result)

        batch_size = 100
        for i in range(0, len(enriched), batch_size):
            save_to_db(enriched[i:i + batch_size])

        print(f"Scraping completo. A aguardar {interval}s...")
        time.sleep(interval)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--delay", type=float, default=0.5)
    parser.add_argument("--interval", type=int, default=300)
    parser.add_argument("--workers", type=int, default=8)
    args = parser.parse_args()

    scrape_loop(delay=args.delay, interval=args.interval, workers=args.workers)


if __name__ == "__main__":
    main()