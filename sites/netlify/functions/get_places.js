const https = require('https');

const GOOGLE_PLACES_API_URL = "https://places.googleapis.com/v1/places:searchText";

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

async function fetchPlaces(apiKey, cityName, placeType, pageToken = null) {
  if (!apiKey) {
    return { places: [], nextPageToken: null };
  }
  
  const textQuery = `${placeType} in ${cityName}`;
  const requestBody = {
    textQuery: textQuery,
    maxResultCount: 5,
    languageCode: "en"
  };
  
  // Add page token if provided (for pagination)
  if (pageToken) {
    requestBody.pageToken = pageToken;
  }
  
  // Specify which fields we want from the API response
  const fieldMask = 'places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.photos,places.googleMapsLinks,nextPageToken';
  
  try {
    const data = await fetchJSONPost(GOOGLE_PLACES_API_URL, apiKey, requestBody, fieldMask);
    
    // Handle errors in the response
    if (data.error) {
      console.error("Google Places API: Error", data.error.message || JSON.stringify(data.error));
      return { places: [], nextPageToken: null };
    }
    
    const places = data.places || [];
    const nextPageToken = data.nextPageToken || null;
    
    const formattedPlaces = places.map(p => {
      // Extract address
      let address = '';
      if (p.formattedAddress) {
        address = p.formattedAddress;
      } else if (p.addressComponents && p.addressComponents.length > 0) {
        address = p.addressComponents.map(ac => ac.longText || ac.shortText).join(', ');
      }
      
      // Extract rating information
      const rating = p.rating ? p.rating : null;
      const userRatingsTotal = p.userRatingCount ? p.userRatingCount : 0;
      
      // Extract photo reference for image URL
      let photoUrl = null;
      if (p.photos && p.photos.length > 0) {
        const photo = p.photos[0];
        if (photo.name) {
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
    
    return {
      places: formattedPlaces,
      nextPageToken: nextPageToken
    };
  } catch (error) {
    console.error("Error fetching places:", error.message);
    return { places: [], nextPageToken: null };
  }
}

exports.handler = async (event, context) => {
  const params = event.queryStringParameters || {};
  const cityName = params.city || "";
  const placeType = params.type || "";
  const pageToken = params.pageToken || null;
  const googleApiKey = process.env.GOOGLE_API_KEY || "";
  
  if (!cityName || !placeType) {
    return {
      statusCode: 400,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({ error: "Missing required parameters: city and type" })
    };
  }
  
  try {
    const result = await fetchPlaces(googleApiKey, cityName, placeType, pageToken);
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify(result)
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({ error: error.message })
    };
  }
};

