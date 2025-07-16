# Houston ARTCC TFMS Viewer

A pure frontend, table-based traffic management tool for the Houston ARTCC (ZHU) on VATSIM.

## Purpose
This site provides real-time situational awareness for Houston ARTCC traffic managers and controllers. It visualizes live VATSIM data, showing:
- All airborne flights within or near the ZHU ARTCC boundary
- Projected sector/specialty loads at +5, +10, and +20 minutes
- Inbound, outbound, internal, and overflight traffic counts
- ZHU Enroute controller staffing

The tool is designed to help anticipate specialty saturation, sector loads, and traffic flows, supporting effective traffic management and controller staffing decisions.

## Features
- **Live VATSIM Data**: Fetches and processes live VATSIM pilot and controller data.
- **Sector & Specialty Assignment**: Assigns each flight to a sector and specialty using Houston ARTCC sector polygons (GeoJSON).
- **Perimeter Logic**: Includes aircraft within 50 NM of the ZHU boundary if inbound to a ZHU airport, projecting their entry sector/specialty.
- **Projection Engine**: Projects each flight's position +5, +10, and +20 minutes ahead, showing projected specialty counts in the summary table.
- **Summary Tables**: Card-based UI for specialty summary, traffic type summary, and ZHU Enroute controller list.
- **Flights Table**: Detailed list of all tracked flights, including route, filed route, sector/specialty, and more.
- **Material Dark Theme**: Modern, readable, and compact UI.
- **Auto-Refresh**: Data updates every 60 seconds, with countdown and last updated timestamp.
- **Deployable on GitHub Pages**: No backend required; all logic runs in the browser.

## Files
- `index.html`: Main HTML entry point.
- `main.js`: Core logic for fetching, filtering, projecting, and rendering VATSIM data and UI.
- `style.css`: Material dark theme and custom styles for cards, tables, and layout.
- `sectors.geojson`: Houston ARTCC sector polygons, including the ZHU perimeter. Required for correct operation.

## How It Works
1. **Fetches** VATSIM data and Houston sector polygons (GeoJSON).
2. **Assigns** each flight to a sector/specialty based on position and altitude.
3. **Projects** each flight's position +5, +10, +20 minutes ahead to estimate future specialty loads.
4. **Displays** summary tables and a detailed flights table in a modern, card-based UI.
5. **Auto-refreshes** every 60 seconds, updating all data and projections.

## Usage
1. Open the site in your browser. No server or backend is required.
2. The UI will update automatically with live VATSIM data and projections.

## Requirements
- Modern web browser (Chrome, Firefox, Edge, Safari)
- Internet access to VATSIM data feed and sector GeoJSON
- A valid `sectors.geojson` file for Houston ARTCC (ZHU)

## License
MIT License. See repository for details.

---

**Developed for Houston ARTCC traffic management and situational awareness.**
