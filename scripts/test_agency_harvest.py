"""
READ-ONLY probe: what agency contact data can we harvest from the portals we
already scrape (fincaraiz + metrocuadrado)?

Answers the user's question BEFORE building anything: for each source, what
fields come free in the search payload, at what fill-rate, and what's missing.

Not a scraper, not wired to the DB. Samples a few pages of Medellín
(venta+arriendo), groups agencies by STABLE ID (fincaraiz owner.id /
metrocuadrado midempresa — never by name), reports a fill-rate + gap table,
and fetches the TRUE inventory count for a couple of fincaraiz agencies so we
can pin down what "cantidad de listings" will mean.

    python scripts/test_agency_harvest.py                 # 3 pages/tipo, medellin
    python scripts/test_agency_harvest.py --pages 6

# ponytail: read-only sample probe. Deeper sampling / more municipios / phone-reveal
# is the production harvest, not this test — this only answers "is the data there?".
"""

import argparse
import json
import re
import sys
import time
from collections import defaultdict
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).parent))         # for scrape_fincaraiz
sys.path.insert(0, str(Path(__file__).parent.parent))  # repo root for scraping.*
import scrape_fincaraiz as fr
from scraping.metrocuadrado.scraper import MetrocuadradoScraper, API_KEY

OUT = Path(__file__).parent.parent / "scratchpad_agency_sample.json"
MUNI = "medellin"


def fill(rows, key, pred=bool):
    """% of rows where pred(row[key]) is truthy."""
    if not rows:
        return 0.0
    n = sum(1 for r in rows if pred(r.get(key)))
    return 100.0 * n / len(rows)


# ------------------------------------------------------------------ fincaraiz
def harvest_fincaraiz(pages):
    owners_raw = []  # one entry per listing that has an owner
    for tipo_url, operacion in [("apartamentos", "venta"), ("apartamentos", "arriendo")]:
        base = fr.BASE_URL.format(operacion=operacion, tipo_url=tipo_url, slug=MUNI)
        for page in range(1, pages + 1):
            url = base if page == 1 else f"{base}?page={page}"
            html = fr.fetch_html(url)
            if not html:
                break
            nd = fr.extract_next_data(html)
            raw, _ = fr.parse_search_fast(nd) if nd else ([], {})
            if not raw:
                break
            for r in raw:
                o = r.get("owner")
                if o:
                    owners_raw.append(o)
            time.sleep(fr.DELAY)
    # dedup by owner.id -> keep richest record + count listings seen
    by_id = {}
    seen_count = defaultdict(int)
    for o in owners_raw:
        oid = o.get("id")
        seen_count[oid] += 1
        if oid not in by_id or len(json.dumps(o)) > len(json.dumps(by_id[oid])):
            by_id[oid] = o
    for oid, o in by_id.items():
        o["_listings_scraped"] = seen_count[oid]
    return owners_raw, list(by_id.values())


def fincaraiz_true_count(owner):
    """Their real inventory via the agency profile page paginatorInfo.total."""
    link = owner.get("inmoPropsLink")
    if not link:
        return None
    html = fr.fetch_html("https://www.fincaraiz.com.co" + link)
    if not html:
        return None
    m = re.search(r'"paginatorInfo":\s*\{[^}]*?"total":\s*(\d+)', html)
    return int(m.group(1)) if m else None


# -------------------------------------------------------------- metrocuadrado
def harvest_metrocuadrado(pages):
    s = MetrocuadradoScraper(max_pages=pages, municipios=[MUNI])
    listings = []
    for operacion in ["venta", "arriendo"]:
        for page in range(pages):
            data = s._get_page("apartamento", operacion, page * 50, MUNI)
            res = (data or {}).get("results", [])
            if not res:
                break
            for r in res:
                listings.append({
                    "midempresa": r.get("midempresa"),
                    "OwnerType": r.get("OwnerType"),
                    "moferente": r.get("moferente"),
                    "contactPhone": r.get("contactPhone"),
                    "whatsapp": r.get("whatsapp"),
                    "mbarrio": r.get("mbarrio"),
                    "link": r.get("link"),
                })
            time.sleep(1.2)
    by_id = defaultdict(lambda: {"listings": 0, "phones": set(), "types": set(), "barrios": set()})
    for r in listings:
        a = by_id[r["midempresa"]]
        a["listings"] += 1
        if r["contactPhone"]:
            a["phones"].add(r["contactPhone"])
        if r["OwnerType"]:
            a["types"].add(r["OwnerType"])
        if r["mbarrio"]:
            a["barrios"].add(r["mbarrio"])
    return listings, by_id


# --------------------------------------------------------------------- report
def bar(pct):
    return "#" * round(pct / 5) + "-" * (20 - round(pct / 5))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=int, default=3, help="pages per (tipo,operacion)")
    args = ap.parse_args()

    print(f"\n{'='*70}\nAGENCY CONTACT HARVEST — probe ({MUNI}, {args.pages} pages/tipo)\n{'='*70}")

    # ---- FINCARAIZ ----
    print("\n[1/2] fincaraiz — scraping owner objects ...")
    fr_listings, fr_agencies = harvest_fincaraiz(args.pages)
    print(f"  listings sampled: {len(fr_listings)}   distinct agencies (by owner.id): {len(fr_agencies)}")
    print("  field fill-rate across distinct agencies:")
    for key, label in [("name", "name"), ("address", "business address"),
                       ("type", "type (inmob/desarrol/particular)"), ("logo", "logo"),
                       ("masked_phone", "masked_phone (partial only)"),
                       ("whatsapp_phone", "whatsapp_phone (FULL)"),
                       ("inmoPropsLink", "profile link")]:
        pct = fill(fr_agencies, key)
        print(f"    {label:34s} [{bar(pct)}] {pct:5.1f}%")

    # true inventory count for top-3 by scraped volume
    top = sorted(fr_agencies, key=lambda o: o["_listings_scraped"], reverse=True)[:3]
    print("  'cantidad' — scraped (floor) vs TRUE inventory (profile paginatorInfo):")
    for o in top:
        true_n = fincaraiz_true_count(o)
        time.sleep(fr.DELAY)
        print(f"    {o.get('name','?')[:32]:32s}  scraped={o['_listings_scraped']:3d}  true={true_n}")

    # ---- METROCUADRADO ----
    print("\n[2/2] metrocuadrado — scraping contact fields ...")
    mc_listings, mc_agencies = harvest_metrocuadrado(args.pages)
    print(f"  listings sampled: {len(mc_listings)}   distinct agencies (by midempresa): {len(mc_agencies)}")
    print("  field fill-rate across LISTINGS:")
    for key, label in [("contactPhone", "contactPhone (FULL, unmasked)"),
                       ("whatsapp", "whatsapp (FULL)"),
                       ("midempresa", "company id"),
                       ("OwnerType", "type")]:
        pct = fill(mc_listings, key)
        print(f"    {label:34s} [{bar(pct)}] {pct:5.1f}%")
    print(f"  NOTE: moferente is a bucket, not a name -> "
          f"distinct values seen: {sorted({r['moferente'] for r in mc_listings if r['moferente']})}")
    print("  top agencies by scraped volume (id / #listings / #phones / types):")
    for mid, a in sorted(mc_agencies.items(), key=lambda kv: kv[1]["listings"], reverse=True)[:5]:
        print(f"    empresa={mid!s:8s}  listings={a['listings']:3d}  phones={len(a['phones'])}  "
              f"types={a['types']}  barrios={len(a['barrios'])}")

    # dump full sample
    OUT.write_text(json.dumps({
        "fincaraiz_agencies": fr_agencies,
        "metrocuadrado_agencies": {
            str(k): {**v, "phones": list(v["phones"]), "types": list(v["types"]),
                     "barrios": sorted(v["barrios"])}
            for k, v in mc_agencies.items()},
    }, ensure_ascii=False, indent=2))
    print(f"\nfull sample -> {OUT}")

    # ---- self-check ----
    assert fr_agencies, "fincaraiz returned no agencies — scraper or site changed"
    assert mc_listings, "metrocuadrado returned no listings — API key or params changed"
    assert fill(mc_listings, "contactPhone") > 50, "metrocuadrado phone fill unexpectedly low"
    print("\nself-check OK: both sources returned agency data; MC phones present.\n")


if __name__ == "__main__":
    main()
