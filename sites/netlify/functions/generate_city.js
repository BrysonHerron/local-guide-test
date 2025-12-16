const https = require('https');

const GOOGLE_PLACES_API_URL = "https://places.googleapis.com/v1/places:searchText";
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
        'User-Agent': 'Netlify Function',
        'Accept': 'application/json'
      }
    };
    
    https.get(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          // Check for HTTP errors
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(jsonData);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

function fetchJSONPost(url, apiKey, body, fieldMask) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const postData = JSON.stringify(body);
    
    const headers = {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'Content-Length': Buffer.byteLength(postData),
      'User-Agent': 'Netlify Function'
    };
    
    // Add field mask if provided (required for Places API New)
    if (fieldMask) {
      headers['X-Goog-FieldMask'] = fieldMask;
    }
    
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: 'POST',
      headers: headers
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          // Check for HTTP errors
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(jsonData);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function fetchWikipedia(cityName) {
  // Try different variations of the city name
  const variations = [];
  
  // Try without state first (split by comma and take first part) - better for small cities
  if (cityName.includes(',')) {
    const cityOnly = cityName.split(',')[0].trim();
    variations.push(cityOnly);
  }
  
  // Try the full name
  variations.push(cityName);
  
  // Try variations for Wikipedia format
  for (const variation of variations) {
    try {
      // Wikipedia REST API expects page titles with spaces replaced by underscores
      // Then we URL encode the path component
      const wikiPath = variation.replace(/ /g, "_");
      // encodeURIComponent will encode special chars but we want to preserve underscores
      const encodedPath = encodeURIComponent(wikiPath).replace(/%5F/g, "_");
      const url = WIKIPEDIA_API_URL + encodedPath;
      const data = await fetchJSON(url);
      
      // Check if we got a valid extract
      if (data.type === "standard" && data.extract && data.extract.length > 0) {
        return data.extract;
      }
      // If we got a disambiguation or other type, try next variation
    } catch (error) {
      // Continue to next variation
      continue;
    }
  }
  
  return "No description available for this location.";
}

async function fetchPlaces(apiKey, cityName, placeType) {
  if (!apiKey) {
    return [];
  }
  
  const textQuery = `${placeType} in ${cityName}`;
  const requestBody = {
    textQuery: textQuery,
    maxResultCount: 5,
    languageCode: "en"
  };
  
  // Specify which fields we want from the API response
  const fieldMask = 'places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.photos,places.googleMapsLinks';
  
  try {
    const data = await fetchJSONPost(GOOGLE_PLACES_API_URL, apiKey, requestBody, fieldMask);
    
    // Log the response for debugging
    const places = data.places || [];
    console.log(`Places API response for "${placeType} in ${cityName}":`, {
      hasResults: places.length > 0,
      resultsCount: places.length,
      errorMessage: data.error ? data.error.message : null
    });
    
    // Handle errors in the response
    if (data.error) {
      console.error("Google Places API: Error", data.error.message || JSON.stringify(data.error));
      return [];
    }
    
    if (places.length > 0) {
      return places.map(p => {
        // Extract address from formattedAddress or addressComponents
        let address = '';
        if (p.formattedAddress) {
          address = p.formattedAddress;
        } else if (p.addressComponents && p.addressComponents.length > 0) {
          // Fallback: construct address from components
          address = p.addressComponents.map(ac => ac.longText || ac.shortText).join(', ');
        }
        
        // Extract rating information
        const rating = p.rating ? p.rating : null;
        const userRatingsTotal = p.userRatingCount ? p.userRatingCount : 0;
        
        // Extract photo reference for image URL
        let photoUrl = null;
        if (p.photos && p.photos.length > 0) {
          // The new API returns photo with name field
          // Format: https://places.googleapis.com/v1/{name}/media?maxHeightPx=400&maxWidthPx=400&key={API_KEY}
          const photo = p.photos[0];
          if (photo.name) {
            // The photo name might be in format "places/{placeId}/photos/{photoId}"
            // We need to construct the media URL
            const photoName = photo.name;
            photoUrl = `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=400&maxWidthPx=400&key=${apiKey}`;
          }
        }
        
        // Extract Google Maps link
        let mapsUrl = null;
        if (p.googleMapsLinks && p.googleMapsLinks.placeUri) {
          mapsUrl = p.googleMapsLinks.placeUri;
        }
        
        return {
          name: p.displayName ? p.displayName.text : 'Unknown',
          address: address,
          rating: rating,
          user_ratings_total: userRatingsTotal,
          photo_url: photoUrl,
          maps_url: mapsUrl
        };
      });
    }
    
    console.log(`No results found for "${placeType} in ${cityName}"`);
    return [];
  } catch (error) {
    console.error("Error fetching places:", error.message);
    // If error message contains information about the API, log it
    if (error.message.includes('REQUEST_DENIED') || error.message.includes('legacy')) {
      console.error("Make sure you have enabled the Places API (New) in your Google Cloud Console and that your API key has the necessary permissions.");
    }
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

function buildCards(title, items, hasApiKey) {
  let cards;
  if (!items || items.length === 0) {
    if (!hasApiKey) {
      cards = "<p class='no-results'>No results found. Google Places API key is not configured. Please set the GOOGLE_API_KEY environment variable in Netlify.</p>";
    } else {
      cards = "<p class='no-results'>No results found for this location.</p>";
    }
  } else {
    cards = items.map(i => {
      const rating = i.rating ? parseFloat(i.rating).toFixed(1) : 'N/A';
      const reviews = i.user_ratings_total ? parseInt(i.user_ratings_total).toLocaleString() : '0';
      
      const imageHtml = i.photo_url 
        ? `<div class='place-image-container'><img src='${i.photo_url}' alt='${escapeHtml(i.name || 'Place')}' class='place-image' loading='lazy' onerror="this.parentElement.innerHTML='<div class=\\'placeholder-image\\'><span>📷</span></div>'"></div>`
        : `<div class='place-image-container'><div class='placeholder-image'><span>📷</span></div></div>`;
      
      const cardContent = `<div class='place-card'>
        ${imageHtml}
        <div class='place-card-content'>
          <div class='place-card-header'>
            <h3 class='place-name'>${escapeHtml(i.name || 'Unknown')}</h3>
            ${i.rating ? `<div class='rating-badge'><span class='rating-icon'>⭐</span><span class='rating-value'>${rating}</span></div>` : ''}
          </div>
          <p class='place-address'>📍 ${escapeHtml(i.address || '')}</p>
          ${i.rating ? `<p class='place-reviews'>${reviews} ${reviews === '1' ? 'review' : 'reviews'}</p>` : ''}
          ${i.maps_url ? `<p class='view-maps-link'>View on Google Maps →</p>` : ''}
        </div>
      </div>`;
      
      // Wrap in link if maps URL is available
      if (i.maps_url) {
        return `<a href='${i.maps_url}' target='_blank' rel='noopener noreferrer' class='place-card-link'>${cardContent}</a>`;
      }
      return cardContent;
    }).join('');
  }
  const adBlock = buildAdBlock();
  return `<section class='places-section'><h2 class='section-title'>${title}</h2>${adBlock}<div class='cards-grid'>${cards}</div></section>`;
}

async function buildCityPage(cityName, googleApiKey) {
  const hasApiKey = !!googleApiKey;
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
<link rel='preconnect' href='https://fonts.googleapis.com'>
<link rel='preconnect' href='https://fonts.gstatic.com' crossorigin>
<link href='https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap' rel='stylesheet'>
<link rel='stylesheet' href='https://cdnjs.cloudflare.com/ajax/libs/normalize/8.0.1/normalize.min.css'>
<style>
* { box-sizing: border-box; }
body { 
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; 
  margin: 0; 
  padding: 0; 
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  color: #333;
  line-height: 1.6;
}
nav { 
  background: linear-gradient(135deg, #0077cc 0%, #005fa3 100%);
  color: white; 
  padding: 1rem 2rem; 
  display: flex; 
  justify-content: space-between; 
  align-items: center;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
  position: sticky;
  top: 0;
  z-index: 100;
}
nav a { 
  color: white; 
  text-decoration: none;
  font-weight: 500;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  transition: background 0.2s ease;
}
nav a:hover {
  background: rgba(255,255,255,0.1);
}
.container { 
  max-width: 1200px; 
  margin: 0 auto; 
  padding: 2rem 1.5rem;
}
.city-header {
  background: white;
  border-radius: 16px;
  padding: 2.5rem;
  margin-bottom: 2rem;
  box-shadow: 0 4px 20px rgba(0,0,0,0.08);
}
.city-header h1 {
  font-size: 2.5rem;
  font-weight: 700;
  color: #0077cc;
  margin: 0 0 1rem 0;
  background: linear-gradient(135deg, #0077cc 0%, #005fa3 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.city-description {
  font-size: 1.1rem;
  color: #555;
  line-height: 1.8;
  margin: 0;
}
.places-section {
  background: white;
  border-radius: 16px;
  padding: 2rem;
  margin-bottom: 2rem;
  box-shadow: 0 4px 20px rgba(0,0,0,0.08);
}
.section-title {
  font-size: 1.75rem;
  font-weight: 600;
  color: #333;
  margin: 0 0 1.5rem 0;
  padding-bottom: 0.75rem;
  border-bottom: 3px solid #0077cc;
  display: inline-block;
}
.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 1.5rem;
  margin-top: 1.5rem;
}
.place-card-link {
  text-decoration: none;
  color: inherit;
  display: block;
  transition: transform 0.3s ease;
}
.place-card-link:hover {
  transform: translateY(-4px);
}
.place-card-link:hover .place-card {
  box-shadow: 0 8px 24px rgba(0,119,204,0.15);
  border-color: rgba(0,119,204,0.3);
}
.place-card {
  background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 2px 12px rgba(0,0,0,0.08);
  transition: all 0.3s ease;
  border: 1px solid rgba(0,119,204,0.1);
  display: flex;
  flex-direction: column;
  cursor: pointer;
  height: 100%;
}
.place-card:hover {
  border-color: rgba(0,119,204,0.3);
}
.place-image-container {
  width: 100%;
  height: 200px;
  overflow: hidden;
  background: linear-gradient(135deg, #e0e0e0 0%, #f5f5f5 100%);
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}
.place-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s ease;
}
.place-card:hover .place-image {
  transform: scale(1.05);
}
.placeholder-image {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #e8e8e8 0%, #d0d0d0 100%);
  color: #999;
  font-size: 3rem;
}
.placeholder-image span {
  opacity: 0.5;
}
.place-card-content {
  padding: 1.5rem;
  flex: 1;
  display: flex;
  flex-direction: column;
}
.place-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.75rem;
  gap: 1rem;
}
.place-name {
  font-size: 1.25rem;
  font-weight: 600;
  color: #0077cc;
  margin: 0;
  flex: 1;
  line-height: 1.4;
}
.rating-badge {
  background: linear-gradient(135deg, #ffd700 0%, #ffed4e 100%);
  padding: 0.4rem 0.75rem;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(255,215,0,0.3);
}
.rating-icon {
  font-size: 1rem;
  line-height: 1;
}
.rating-value {
  font-weight: 700;
  color: #333;
  font-size: 0.95rem;
}
.place-address {
  color: #666;
  font-size: 0.95rem;
  margin: 0.5rem 0;
  line-height: 1.5;
}
.place-reviews {
  color: #888;
  font-size: 0.85rem;
  margin: 0.5rem 0 0 0;
  font-weight: 500;
}
.view-maps-link {
  color: #0077cc;
  font-size: 0.85rem;
  margin: 0.75rem 0 0 0;
  font-weight: 600;
  opacity: 0.8;
  transition: opacity 0.2s ease;
}
.place-card-link:hover .view-maps-link {
  opacity: 1;
}
.no-results {
  text-align: center;
  color: #888;
  font-style: italic;
  padding: 2rem;
  background: #f8f9fa;
  border-radius: 8px;
}
.ad-container { 
  margin: 2rem 0; 
  text-align: center;
  padding: 1rem;
  background: #f8f9fa;
  border-radius: 8px;
}
@media (max-width: 768px) {
  .container {
    padding: 1rem;
  }
  .city-header {
    padding: 1.5rem;
  }
  .city-header h1 {
    font-size: 2rem;
  }
  .cards-grid {
    grid-template-columns: 1fr;
    gap: 1rem;
  }
  .places-section {
    padding: 1.5rem;
  }
  nav {
    padding: 0.75rem 1rem;
    flex-wrap: wrap;
  }
}
</style>
<script async src='https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-0000000000000000' crossorigin='anonymous'></script>
</head>
<body>
<nav>
  <div><strong>Travel Planner</strong></div>
  <a href='/'>Back to Search</a>
</nav>
<div class='container'>
  <div class='city-header'>
    <h1>${escapeHtml(cityName)}</h1>
    <p class='city-description'>${escapeHtml(wikiText)}</p>
  </div>
  ${buildCards("Top Attractions", attractions, hasApiKey)}
  ${buildCards("Popular Hotels", hotels, hasApiKey)}
  ${buildCards("Best Restaurants", restaurants, hasApiKey)}
</div>
</body>
</html>`;
}

exports.handler = async (event, context) => {
  const params = event.queryStringParameters || {};
  const city = params.name || "Unknown City";
  const googleApiKey = process.env.GOOGLE_API_KEY || "";
  
  // Debug: log if API key is found
  if (!googleApiKey) {
    console.log("Warning: GOOGLE_API_KEY not found in environment variables");
    console.log("Available env vars:", Object.keys(process.env).filter(k => k.includes('GOOGLE')));
  } else {
    console.log("GOOGLE_API_KEY found, length:", googleApiKey.length);
  }

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

