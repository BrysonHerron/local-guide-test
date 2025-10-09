import aiohttp
import asyncio
import html

GOOGLE_API_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json"
WIKIPEDIA_API_URL = "https://en.wikipedia.org/api/rest_v1/page/summary/"

async def fetch_json(session, url, params=None):
    async with session.get(url, params=params) as response:
        return await response.json()

async def fetch_wikipedia(session, city_name):
    try:
        async with session.get(WIKIPEDIA_API_URL + city_name.replace(" ", "_")) as resp:
            if resp.status == 200:
                data = await resp.json()
                return data.get("extract", "No description found.")
    except Exception:
        return "No description available."
    return "No description available."

async def fetch_places(session, api_key, city_name, place_type):
    params = {
        "query": f"{place_type} in {city_name}",
        "key": api_key
    }
    try:
        data = await fetch_json(session, GOOGLE_API_URL, params)
        return [
            {
                "name": p.get("name"),
                "address": p.get("formatted_address"),
                "rating": p.get("rating"),
                "user_ratings_total": p.get("user_ratings_total"),
            }
            for p in data.get("results", [])[:5]
        ]
    except Exception:
        return []

def build_ad_block():
    return '''<div class="ad-container">
  <ins class="adsbygoogle"
       style="display:block"
       data-ad-client="ca-pub-0000000000000000"
       data-ad-slot="0000000000"
       data-ad-format="auto"
       data-full-width-responsive="true"></ins>
  <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
</div>'''

async def build_city_page(city_name, google_api_key):
    async with aiohttp.ClientSession() as session:
        wiki_task = asyncio.create_task(fetch_wikipedia(session, city_name))
        places_tasks = [
            asyncio.create_task(fetch_places(session, google_api_key, city_name, t))
            for t in ["tourist attractions", "hotels", "restaurants"]
        ]
        wiki_text = await wiki_task
        attractions, hotels, restaurants = await asyncio.gather(*places_tasks)

    ad_block = build_ad_block()

    def build_cards(title, items):
        cards = "".join(
            f"<div class='card'><h3>{html.escape(i['name'])}</h3>"
            f"<p>{html.escape(i.get('address',''))}</p>"
            f"<p>⭐ {i.get('rating','N/A')} ({i.get('user_ratings_total','0')} reviews)</p></div>"
            for i in items
        )
        return f"<section><h2>{title}</h2>{ad_block}{cards}</section>"

    html_page = f"""<!DOCTYPE html>
<html lang='en'>
<head>
<meta charset='UTF-8'>
<meta name='viewport' content='width=device-width, initial-scale=1.0'>
<title>{html.escape(city_name)} Travel Guide</title>
<link rel='stylesheet' href='https://cdnjs.cloudflare.com/ajax/libs/normalize/8.0.1/normalize.min.css'>
<style>
body {{ font-family: Arial, sans-serif; margin: 0; padding: 0; background: #f9f9f9; }}
nav {{ background: #0077cc; color: white; padding: 10px; display: flex; justify-content: space-between; align-items: center; }}
nav a {{ color: white; text-decoration: none; }}
.container {{ max-width: 900px; margin: 20px auto; padding: 20px; background: white; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }}
.card {{ background: #f0f0f0; padding: 10px; margin: 10px 0; border-radius: 6px; }}
.ad-container {{ margin: 20px 0; text-align: center; }}
</style>
<script async src='https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-0000000000000000' crossorigin='anonymous'></script>
</head>
<body>
<nav>
  <div><strong>Travel Planner</strong></div>
  <a href='/'>Back to Search</a>
</nav>
<div class='container'>
  <h1>{html.escape(city_name)}</h1>
  <p>{html.escape(wiki_text)}</p>
  {build_cards("Top Attractions", attractions)}
  {build_cards("Popular Hotels", hotels)}
  {build_cards("Best Restaurants", restaurants)}
</div>
</body>
</html>"""
    return html_page
