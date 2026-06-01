import requests

q = """[out:json][timeout:30];
(
  node["amenity"="cafe"](5.95,-75.76,6.52,-75.43);
);
out center;"""

HEADERS = {
    "User-Agent": "urbi-map-vision/1.0 (data pipeline; info.facturIA@gmail.com)",
    "Accept": "application/json",
}

mirrors = [
    "https://overpass-api.de/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://overpass.openstreetmap.fr/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]

for url in mirrors:
    try:
        r = requests.post(url, data={"data": q}, headers=HEADERS, timeout=40)
        print(url, "->", r.status_code, "len=", len(r.text))
        if r.status_code == 200:
            data = r.json()
            print("  elementos:", len(data.get("elements", [])))
            break
        else:
            print("  body:", r.text[:200])
    except Exception as e:
        print(url, "-> ERROR:", e)
