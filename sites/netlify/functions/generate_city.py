import os
import asyncio
from build_sites3 import build_city_page

def handler(event, context):
    params = event.get("queryStringParameters") or {}
    city = params.get("name", "Unknown City")
    google_api_key = os.getenv("GOOGLE_API_KEY", "")

    try:
        html_output = asyncio.run(build_city_page(city, google_api_key))
        return {
            "statusCode": 200,
            "headers": {"Content-Type": "text/html"},
            "body": html_output
        }
    except Exception as e:
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": f"{{'error': '{str(e)}'}}"
        }
