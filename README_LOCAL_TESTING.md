# Local Testing Guide

This guide explains how to test your Netlify functions locally before deploying.

## Prerequisites

1. **Node.js** (v14 or higher) - [Download here](https://nodejs.org/)
2. **Netlify CLI** - Will be installed as a dependency

## Setup Steps

### 1. Install Dependencies

From the project root directory, run:

```bash
npm install
```

This will install Netlify CLI as a dev dependency.

### 2. Set Environment Variables

Create a `.env` file in the project root (same level as `package.json`):

```bash
GOOGLE_API_KEY=your_google_api_key_here
```

**Important:** The `.env` file is already in `.gitignore` so it won't be committed to git.

### 3. Start Local Development Server

Run:

```bash
npm run dev
```

Or directly:

```bash
npx netlify dev
```

This will:
- Start a local server (usually on `http://localhost:8888`)
- Serve your static files from `sites/public`
- Make your Netlify functions available at `http://localhost:8888/.netlify/functions/generate_city`

### 4. Test the Function

1. Open your browser and go to: `http://localhost:8888`
2. Enter a city name (e.g., "Paris, France" or "Cullowhee, North Carolina")
3. Click "Generate Guide"
4. The function should run locally and display results

### 5. Test Function Directly

You can also test the function directly via URL:

```
http://localhost:8888/.netlify/functions/generate_city?name=Paris,%20France
```

## Troubleshooting

### 404 Not Found Error

If you get a 404 error:

1. **Check that the server started successfully:**
   - You should see output like: `Server now ready on http://localhost:8888`
   - If you see errors about `netlify.toml`, make sure it exists in the root directory

2. **Verify the URL:**
   - Main site: `http://localhost:8888/` (should show index.html)
   - Function test: `http://localhost:8888/.netlify/functions/generate_city?name=Paris,%20France`

3. **Check function path:**
   - Function file should be at: `sites/netlify/functions/generate_city.js`
   - Netlify.toml should be in root with: `functions = "netlify/functions"`

4. **If still not working, try:**
   ```bash
   # Delete node_modules and reinstall
   rm -rf node_modules
   npm install
   
   # Then try again
   npm run dev
   ```

### Other Issues

- **Function not found:** Make sure you're running `netlify dev` from the project root
- **API key errors:** Check that your `.env` file has `GOOGLE_API_KEY` set
- **Port already in use:** Netlify CLI will try different ports automatically (check terminal output)

## Notes

- Local testing uses the same function code that will run on Netlify
- Environment variables from `.env` are automatically loaded
- The function logs will appear in your terminal

