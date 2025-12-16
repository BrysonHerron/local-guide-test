const https = require('https');

const GOOGLE_API_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json";
const WIKIPEDIA_API_URL = "https://en.wikipedia.org/api/rest_v1/page/summary/";

function fetchJSON(url, params = {}) {
  return new Promise((resolve, reject) => {
    const queryString = new URLSearchParams(params).toString();
    const fullUrl = queryString ? `${url}?${queryString}` : url;
    const urlObj = new URL(fullUrl);
    
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Netlify Function'
      }
    };
    
    https.get(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function fetchWikipedia(cityName) {
  try {
    // Wikipedia API expects underscores for spaces
    const wikiPath = cityName.replace(/ /g, "_");
    const url = WIKIPEDIA_API_URL + wikiPath;
    const data = await fetchJSON(url);
    return data.extract || "No description found.";
  } catch (error) {
    return "No description available.";
  }
}

async function fetchPlaces(apiKey, cityName, placeType) {
  if (!apiKey) {
    return [];
  }
  
  const params = {
    query: `${placeType} in ${cityName}`,
    key: apiKey
  };
  
  try {
    const data = await fetchJSON(GOOGLE_API_URL, params);
    if (data.status === "REQUEST_DENIED") {
      return [];
    }
    return (data.results || []).slice(0, 5).map(p => ({
      name: p.name,
      address: p.formatted_address,
      rating: p.rating,
      user_ratings_total: p.user_ratings_total
    }));
  } catch (error) {
    return [];
  }
}

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

function buildAdBlock() {
  return `<div class="ad-container">
  <ins class="adsbygoogle"
       style="display:block"
       data-ad-client="ca-pub-0000000000000000"
       data-ad-slot="0000000000"
       data-ad-format="auto"
       data-full-width-responsive="true"></ins>
  <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
</div>`;
}

function buildCards(title, items) {
  let cards;
  if (!items || items.length === 0) {
    cards = "<p>No results found. Please check your API key configuration.</p>";
  } else {
    cards = items.map(i => 
      `<div class='card'>
        <h3>${escapeHtml(i.name || 'Unknown')}</h3>
        <p>${escapeHtml(i.address || '')}</p>
        <p>⭐ ${i.rating || 'N/A'} (${i.user_ratings_total || '0'} reviews)</p>
      </div>`
    ).join('');
  }
  const adBlock = buildAdBlock();
  return `<section><h2>${title}</h2>${adBlock}${cards}</section>`;
}

async function buildCityPage(cityName, googleApiKey) {
  const [wikiText, attractions, hotels, restaurants] = await Promise.all([
    fetchWikipedia(cityName),
    fetchPlaces(googleApiKey, cityName, "tourist attractions"),
    fetchPlaces(googleApiKey, cityName, "hotels"),
    fetchPlaces(googleApiKey, cityName, "restaurants")
  ]);

  return `<!DOCTYPE html>
<html lang='en'>
<head>
<meta charset='UTF-8'>
<meta name='viewport' content='width=device-width, initial-scale=1.0'>
<title>${escapeHtml(cityName)} Travel Guide</title>
<link rel='stylesheet' href='https://cdnjs.cloudflare.com/ajax/libs/normalize/8.0.1/normalize.min.css'>
<style>
body { font-family: Arial, sans-serif; margin: 0; padding: 0; background: #f9f9f9; }
nav { background: #0077cc; color: white; padding: 10px; display: flex; justify-content: space-between; align-items: center; }
nav a { color: white; text-decoration: none; }
.container { max-width: 900px; margin: 20px auto; padding: 20px; background: white; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
.card { background: #f0f0f0; padding: 10px; margin: 10px 0; border-radius: 6px; }
.ad-container { margin: 20px 0; text-align: center; }
</style>
<script async src='https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-0000000000000000' crossorigin='anonymous'></script>
</head>
<body>
<nav>
  <div><strong>Travel Planner</strong></div>
  <a href='/'>Back to Search</a>
</nav>
<div class='container'>
  <h1>${escapeHtml(cityName)}</h1>
  <p>${escapeHtml(wikiText)}</p>
  ${buildCards("Top Attractions", attractions)}
  ${buildCards("Popular Hotels", hotels)}
  ${buildCards("Best Restaurants", restaurants)}
</div>
</body>
</html>`;
}

exports.handler = async (event, context) => {
  const params = event.queryStringParameters || {};
  const city = params.name || "Unknown City";
  const googleApiKey = process.env.GOOGLE_API_KEY || "";

  try {
    const htmlOutput = await buildCityPage(city, googleApiKey);
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "text/html"
      },
      body: htmlOutput
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ error: error.message })
    };
  }
};

