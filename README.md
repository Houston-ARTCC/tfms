# Houston ARTCC TFMS Viewer
## How to Use

1. **Open the site in your browser.** No server or backend is required.
2. **Upload a custom split JSON (optional):**
   - Click the "Upload Split" button and select a JSON file with your split definitions.
   - Example split JSON:
     ```json
     {
       "24": ["24", "92", "63", "25"],
       "34": ["34", "27", "65"],
       "46": ["46", "47", "48", "49", "50"]
     }
     ```
   - Each key is a split name; each value is an array of sector names/IDs as defined in your `sectors.geojson`.
3. **Review the summary tables and flights table:**
   - Specialty Summary: Shows current and projected (+5, +10, +20 min) aircraft counts by specialty.
   - Split Summary: Shows counts for your custom splits (if uploaded).
   - ZHU Enroute Online: Lists all ZHU enroute controllers online.
   - Airborne Flights: Table of all tracked flights with details.
4. **Data auto-refreshes every 60 seconds.**
5. **If a data fetch error occurs, use the Retry button to reload without losing your custom split or logging state.**

## What the Tool Does

- Visualizes all airborne flights within or near (50 NM) the ZHU ARTCC boundary using live VATSIM data.
- Assigns each flight to a sector and specialty using Houston ARTCC sector polygons.
- Projects each flight's position +5, +10, and +20 minutes ahead to estimate future specialty and split loads.
- Displays summary tables for specialties and custom splits, plus a detailed flights table and controller list.
- Supports uploading a custom split JSON for split-based summary counts.
- Auto-refreshes data every 60 seconds, with a countdown and last updated timestamp.
- Handles data fetch errors gracefully, preserving your custom split and logging state.

## What the Tool Does NOT Do

- Does not provide graphical maps or sector overlays (table-based only).
- Does not persist custom splits or logs after a full browser refresh (session only).
- Does not support editing splits in the UI yet (upload only).