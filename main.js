// ZHU airports for highlighting
const ZHU_AIRPORTS = [
    'KAEX','KARA','KAUS','KBAZ','KBFM','KBIX','KBPT','KBRO','KBTR','KCLL','KCRP','KCWF','KCXO','KDLF','KDWH','KEDC','KEFD','KGLS','KGPT','KGTU','KHDC','KHOU','KHRL','KHSA','KHUM','KHYI','KIAH','KLCH','KLFT','KLRD','KMFE','KMOB','KMSY','KNBG','KNEW','KNGP','KNGW','KNOG','KNQI','KNWL','KPOE','KPQL','KRND','KSAT','KSGR','KSKF','KSSF','KTME','KVCT'
];
// main.js
// Houston ARTCC Traffic Management Tool (Pure Frontend)

const VATSIM_API = 'https://data.vatsim.net/v3/vatsim-data.json'; // CORS-enabled mirror
const HOUSTON_SECTORS_GEOJSON = 'sectors.geojson'; // Place your GeoJSON file in the root folder

// Helper: Fetch VATSIM data
async function fetchVatsimData() {
    window.processingStatus = 'Fetching VATSIM data...';
    updateFooter();
    const res = await fetch(VATSIM_API);
    if (!res.ok) throw new Error('Failed to fetch VATSIM data');
    return res.json();
}

// Helper: Fetch GeoJSON
async function fetchSectors() {
    const res = await fetch(HOUSTON_SECTORS_GEOJSON);
    if (!res.ok) throw new Error('Failed to fetch sector GeoJSON');
    return res.json();
}

// Helper: Point-in-Polygon (Ray Casting)
function pointInPolygon(point, polygon) {
    // point: [lon, lat], polygon: array of [lon, lat]
    let [x, y] = point;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        let [xi, yi] = polygon[i];
        let [xj, yj] = polygon[j];
        let intersect = ((yi > y) !== (yj > y)) &&
            (x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

// Helper: Project position (simple flat earth, for short distances)
function projectPosition(lat, lon, heading, groundspeed, minutes) {
    // heading in degrees, groundspeed in knots, minutes in minutes
    // Returns [lat, lon] projected
    const R = 6371; // Earth radius in km
    const dist_km = groundspeed * 1.852 * (minutes / 60); // knots to km
    const brng = heading * Math.PI / 180;
    const lat1 = lat * Math.PI / 180;
    const lon1 = lon * Math.PI / 180;
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(dist_km / R) + Math.cos(lat1) * Math.sin(dist_km / R) * Math.cos(brng));
    const lon2 = lon1 + Math.atan2(Math.sin(brng) * Math.sin(dist_km / R) * Math.cos(lat1), Math.cos(dist_km / R) - Math.sin(lat1) * Math.sin(lat2));
    return [lat2 * 180 / Math.PI, lon2 * 180 / Math.PI];
}

// Helper: Haversine distance in NM between two lat/lon points
function haversineNM(lat1, lon1, lat2, lon2) {
    const R = 3440.065; // Earth radius in nautical miles
    const toRad = x => x * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// Helper: Minimum distance from point to polygon (in NM)
function minDistanceToPolygon(lat, lon, polygon) {
    let minDist = Infinity;
    for (let i = 0; i < polygon.length; ++i) {
        let [lon1, lat1] = polygon[i];
        let [lon2, lat2] = polygon[(i+1)%polygon.length];
        // Sample points along the edge for a rough min distance
        for (let t = 0; t <= 1; t += 0.1) {
            let latEdge = lat1 + t * (lat2 - lat1);
            let lonEdge = lon1 + t * (lon2 - lon1);
            let d = haversineNM(lat, lon, latEdge, lonEdge);
            if (d < minDist) minDist = d;
        }
    }
    return minDist;
}

// Main: Filter and display
async function updateData() {
    try {
        const [vatsim, sectors] = await Promise.all([
            fetchVatsimData(),
            fetchSectors()
        ]);
        // Store sectors globally for projection lookup
        window.sectorsGeoJSON = sectors;
        // Extract HOU_ controllers for ZHU Enroute Online table
        window.zhuControllers = (vatsim.controllers || []).filter(ctrl => ctrl.callsign && ctrl.callsign.startsWith('HOU_'));
        window.processingStatus = 'Processing data...';
        updateFooter();
        // Find ZHU perimeter polygon (sector === 'zhu')
        let zhuPerimeter = null;
        for (const feature of sectors.features) {
            if (feature.properties && feature.properties.sector && feature.properties.sector.toLowerCase() === 'zhu') {
                zhuPerimeter = feature.geometry.coordinates[0];
                break;
            }
        }
        // Find which sector each pilot is in (exclude sector=zhu for assignment)
        let flights = vatsim.pilots.map(pilot => {
            if (!pilot.latitude || !pilot.longitude) return null;
            let found = null;
            let altitude = pilot.altitude;
            for (let i = 0; i < sectors.features.length; ++i) {
                const feature = sectors.features[i];
                // Exclude sector=zhu from assignment
                if (feature.properties && feature.properties.sector && feature.properties.sector.toLowerCase() === 'zhu') continue;
                const poly = feature.geometry.coordinates[0];
                if (pointInPolygon([pilot.longitude, pilot.latitude], poly)) {
                    let floor = (feature.properties.floor !== undefined && feature.properties.floor !== null) ? Number(feature.properties.floor) : -99999;
                    let ceiling = (feature.properties.ceiling !== undefined && feature.properties.ceiling !== null) ? Number(feature.properties.ceiling) : 99999;
                    if (typeof altitude === 'number' && altitude >= floor && altitude < ceiling) {
                        found = feature.properties;
                        break;
                    }
                }
            }
            if (found) {
                return {
                    ...pilot,
                    sector: found.sector,
                    specialty: found.specialty,
                    nearPerimeter: false
                };
            }
            // If not in any sector, check if within 50 NM of ZHU perimeter and destination is a ZHU airport
            if (zhuPerimeter) {
                let dist = minDistanceToPolygon(pilot.latitude, pilot.longitude, zhuPerimeter);
                let arrival = (pilot.flight_plan && pilot.flight_plan.arrival) ? pilot.flight_plan.arrival.toUpperCase() : '';
                if (dist <= 50 && ZHU_AIRPORTS.includes(arrival)) {
                    // Project 25 NM ahead along heading
                    let proj = null;
                    if (typeof pilot.heading === 'number' && typeof pilot.groundspeed === 'number') {
                        // Calculate minutes to travel 25 NM
                        let minutes = pilot.groundspeed > 0 ? (25 / pilot.groundspeed) * 60 : 0;
                        proj = projectPosition(pilot.latitude, pilot.longitude, pilot.heading, pilot.groundspeed, minutes);
                    }
                    let sector = '', specialty = '';
                    if (proj) {
                        for (let i = 0; i < sectors.features.length; ++i) {
                            const feature = sectors.features[i];
                            if (feature.properties && feature.properties.sector && feature.properties.sector.toLowerCase() === 'zhu') continue;
                            const poly = feature.geometry.coordinates[0];
                            if (pointInPolygon([proj[1], proj[0]], poly)) {
                                let floor = (feature.properties.floor !== undefined && feature.properties.floor !== null) ? Number(feature.properties.floor) : -99999;
                                let ceiling = (feature.properties.ceiling !== undefined && feature.properties.ceiling !== null) ? Number(feature.properties.ceiling) : 99999;
                                if (typeof altitude === 'number' && altitude >= floor && altitude < ceiling) {
                                    sector = feature.properties.sector;
                                    specialty = feature.properties.specialty;
                                    break;
                                }
                            }
                        }
                    }
                    return {
                        ...pilot,
                        sector,
                        specialty,
                        nearPerimeter: true
                    };
                }
            }
            return null;
        })
        .filter(Boolean)
        .filter(flight => typeof flight.groundspeed === 'number' && flight.groundspeed >= 20);
        // Project positions
        const projections = flights.map(flight => {
            const { latitude, longitude, heading, groundspeed, altitude, callsign, sector, specialty, flight_plan } = flight;
            let departure = flight_plan && flight_plan.departure ? flight_plan.departure : '';
            let arrival = flight_plan && flight_plan.arrival ? flight_plan.arrival : '';
            return {
                callsign,
                sector,
                specialty,
                departure,
                arrival,
                flight_plan,
                groundspeed,
                altitude,
                proj5: projectPosition(latitude, longitude, heading, groundspeed, 5),
                proj10: projectPosition(latitude, longitude, heading, groundspeed, 10),
                proj20: projectPosition(latitude, longitude, heading, groundspeed, 20)
            };
        });
        // Display
        renderResults(projections);
        window.lastFlightCount = projections.length;
        window.processingStatus = '';
        updateFooter();
    } catch (e) {
        window.processingStatus = 'Error: ' + e.message;
        updateFooter();
    }
}

// Store previous values for flashing
let previousTableData = {};

// Specialty Summary Logging
let specialtyLogActive = false;
let specialtyLog = [];
let specialtyLogHeaders = [];

function renderResults(projections) {
    const container = document.getElementById('results');
    if (projections.length === 0) {
        container.innerHTML = '<p>No airborne flights found.</p>';
        previousTableData = {};
        return;
    }
    // Build new data map for comparison
    let newTableData = {};

    // ...existing code...
    let html = `<table id="flights-table"><thead><tr>
        <th>Callsign</th>
        <th>Aircraft</th>
        <th>GS (kt)</th>
        <th>Alt (ft)</th>
        <th>Route</th>
        <th class='filed-route-header'>Filed Route</th>
        <th>Sector (Specialty)</th>
    </tr></thead><tbody>`;
    for (const p of projections) {
        let dep = (p.departure || '').toUpperCase();
        let arr = (p.arrival || '').toUpperCase();
        let routeCell = `${dep} → ${arr}`;
        let aircraft = (p.flight_plan && p.flight_plan.aircraft_short) ? p.flight_plan.aircraft_short : (p.flight_plan && p.flight_plan.aircraft) ? p.flight_plan.aircraft : '';
        let gs = (typeof p.groundspeed === 'number') ? p.groundspeed : '';
        let alt = '';
        if (typeof p.altitude === 'number') {
            // Round to nearest 500
            let rounded = Math.round(p.altitude / 500) * 500;
            alt = rounded.toLocaleString();
        }
        let filedRoute = (p.flight_plan && p.flight_plan.route) ? p.flight_plan.route : '';
        // Compose a unique key for the row
        let key = p.callsign;
        // If altitude is below 10000 ft, override sector
        let displaySector = '';
        if (typeof p.altitude === 'number' && p.altitude < 10000) {
            displaySector = 'TRACON';
        } else {
            displaySector = `${p.sector} (${p.specialty})`;
        }
        // Store current values for each cell
        newTableData[key] = {
            callsign: p.callsign, aircraft, gs, alt, routeCell, filedRoute, sector: displaySector
        };
        // For each cell, add a data-key and data-field for later comparison
        html += `<tr data-key="${key}">
            <td data-field="callsign">${p.callsign}</td>
            <td data-field="aircraft">${aircraft}</td>
            <td data-field="gs">${gs}</td>
            <td data-field="alt">${alt}</td>
            <td data-field="routeCell">${routeCell}</td>
            <td data-field="filedRoute" class="filed-route-cell">${filedRoute}</td>
            <td data-field="sector">${displaySector}</td>
        </tr>`;
    }
    html += '</tbody></table>';
    container.innerHTML = html;

    // --- Specialty summary table ---
    // Count aircraft per specialty (excluding TRACON and blank specialties)
    let specialtyCounts = {};
    // Prepare projection counts for +5, +10, +20 min using corrected logic
    let projCounts5 = {}, projCounts10 = {}, projCounts20 = {};
    for (const p of projections) {
        let specialty = (typeof p.altitude === 'number' && p.altitude < 10000) ? null : p.specialty;
        if (specialty && specialty.trim() !== '') {
            specialtyCounts[specialty] = (specialtyCounts[specialty] || 0) + 1;
        }
        // +5, +10, +20 projections using correct logic
        function getProjSpecialty(proj, alt) {
            if (!proj) return null;
            let found = null;
            for (let i = 0; i < window.sectorsGeoJSON.features.length; ++i) {
                const feature = window.sectorsGeoJSON.features[i];
                const poly = feature.geometry.coordinates[0];
                if (pointInPolygon([proj[1], proj[0]], poly)) {
                    let floor = (feature.properties.floor !== undefined && feature.properties.floor !== null) ? Number(feature.properties.floor) : -99999;
                    let ceiling = (feature.properties.ceiling !== undefined && feature.properties.ceiling !== null) ? Number(feature.properties.ceiling) : 99999;
                    if (typeof alt === 'number' && alt >= floor && alt < ceiling) {
                        found = feature.properties;
                        break;
                    }
                }
            }
            return found ? found.specialty : null;
        }
        if (!(typeof p.altitude === 'number' && p.altitude < 10000)) {
            let s5 = getProjSpecialty(p.proj5, p.altitude);
            let s10 = getProjSpecialty(p.proj10, p.altitude);
            let s20 = getProjSpecialty(p.proj20, p.altitude);
            if (s5) projCounts5[s5] = (projCounts5[s5] || 0) + 1;
            if (s10) projCounts10[s10] = (projCounts10[s10] || 0) + 1;
            if (s20) projCounts20[s20] = (projCounts20[s20] || 0) + 1;
        }
    }
    // Get all specialties from GeoJSON (if available)
    let allSpecialties = [];
    if (window.sectorsGeoJSON) {
        const set = new Set();
        for (const f of window.sectorsGeoJSON.features) {
            if (f.properties && f.properties.specialty) set.add(f.properties.specialty);
        }
        allSpecialties = Array.from(set);
    }
    // Ensure all 7 specialties are shown, even if count is 0
    let summaryHtml = '<h3>Specialty Summary</h3>';
    summaryHtml += '<table id="specialty-summary"><thead><tr><th>Specialty</th><th>Now</th><th>+5</th><th>+10</th><th>+20</th></tr></thead><tbody>';
    for (const specialty of allSpecialties.sort()) {
        const count = specialtyCounts[specialty] || 0;
        const c5 = projCounts5[specialty] || 0;
        const c10 = projCounts10[specialty] || 0;
        const c20 = projCounts20[specialty] || 0;
        // Helper to get class for a count
        function getClass(val) {
            if (val < 5) return 'ss-green';
            else if (val >= 6 && val <= 10) return 'ss-yellow';
            else if (val > 11) return 'ss-red';
            else return '';
        }
        summaryHtml += `<tr><td>${specialty}</td>`
            + `<td class=\"${getClass(count)}\">${count}</td>`
            + `<td class=\"${getClass(c5)}\">${c5}</td>`
            + `<td class=\"${getClass(c10)}\">${c10}</td>`
            + `<td class=\"${getClass(c20)}\">${c20}</td></tr>`;
    }
    summaryHtml += '</tbody></table>';

    // --- Specialty Summary Logging ---
    if (specialtyLogActive && allSpecialties.length > 0) {
        // On first log, set headers (only NOW columns)
        if (specialtyLog.length === 0) {
            specialtyLogHeaders = ['Timestamp (UTC)'];
            for (const specialty of allSpecialties.sort()) {
                specialtyLogHeaders.push(`${specialty} Now`);
            }
            specialtyLog.push(specialtyLogHeaders);
        }
        // Build row (UTC timestamp, only NOW columns)
        let row = [new Date().toISOString().replace('T', ' ').replace(/\..+/, '') + 'Z'];
        for (const specialty of allSpecialties.sort()) {
            row.push(specialtyCounts[specialty] || 0);
        }
        specialtyLog.push(row);
    }

    // --- Inbound/Outbound/Internal/Overflight summary table ---
    let inbound = 0, outbound = 0, internal = 0, overflight = 0;
    for (const p of projections) {
        let dep = (p.departure || '').toUpperCase();
        let arr = (p.arrival || '').toUpperCase();
        let depInZHU = ZHU_AIRPORTS.includes(dep);
        let arrInZHU = ZHU_AIRPORTS.includes(arr);
        if (p.nearPerimeter || arrInZHU) {
            inbound++;
        } else if (depInZHU && arrInZHU) {
            internal++;
        } else if (depInZHU) {
            outbound++;
        } else {
            overflight++;
        }
    }
    let ioHtml = '<h3>Traffic Type Summary</h3>';
    ioHtml += '<table id="io-summary"><thead><tr><th>Type</th><th>Count</th></tr></thead><tbody>';
    ioHtml += `<tr><td>Inbound</td><td>${inbound}</td></tr>`;
    ioHtml += `<tr><td>Outbound</td><td>${outbound}</td></tr>`;
    ioHtml += `<tr><td>Internal</td><td>${internal}</td></tr>`;
    ioHtml += `<tr><td>Overflight</td><td>${overflight}</td></tr>`;
    ioHtml += '</tbody></table>';
    container.innerHTML += ioHtml;


    // --- ZHU Enroute Online table ---
    // This table lists all controllers with callsigns starting with HOU_ (ZHU Enroute)
    const zhuControllers = window.zhuControllers || [];
    let zhuHtml = '<h3>ZHU Enroute Online</h3>';
    zhuHtml += '<table id="zhu-enroute"><thead><tr><th>Callsign</th><th>Name</th><th>CID</th></tr></thead><tbody>';
    if (zhuControllers.length === 0) {
        zhuHtml += '<tr><td colspan="3">None online</td></tr>';
    } else {
        for (const ctrl of zhuControllers) {
            // Each row: controller callsign, name, and cid
            zhuHtml += `<tr><td>${ctrl.callsign}</td><td>${ctrl.name || ''}</td><td>${ctrl.cid || ''}</td></tr>`;
        }
    }
    zhuHtml += '</tbody></table>';

    // Render Specialty Summary, Traffic Type Summary, and ZHU Enroute Online side by side, each in a card (flex container)
    let summaryWrapper = '<div class="summary-flex">';
    summaryWrapper += `<div class="card">${summaryHtml}</div>`;
    summaryWrapper += `<div class="card">${ioHtml}</div>`;
    summaryWrapper += `<div class="card">${zhuHtml}</div>`;
    summaryWrapper += '</div>';
    container.innerHTML = summaryWrapper;

    // --- Airborne flights table (moved to bottom, in a card) ---
    container.innerHTML += `<div class="card">${html}</div>`;
}


// Auto-refresh logic
let lastUpdate = null;
let nextUpdate = null;
let countdownInterval = null;

function updateFooter() {
    const footer = document.getElementById('footer');
    if (!footer) return;
    let now = new Date();
    let ts = lastUpdate ? lastUpdate.toLocaleTimeString() : 'Never';
    let secs = nextUpdate ? Math.max(0, Math.round((nextUpdate - now) / 1000)) : 60;
    let flightCount = (typeof window.lastFlightCount === 'number') ? window.lastFlightCount : '';
    let flightInfo = flightCount !== '' ? `Found <b>${flightCount}</b> airborne flights.<br>` : '';
    let processing = window.processingStatus ? `<span id="processing-status">${window.processingStatus}</span><br>` : '';
    footer.innerHTML = `${processing}${flightInfo}Last updated: <b>${ts}</b> &nbsp;|&nbsp; Next update in: <b><span id="countdown">${secs}</span> sec</b>`;
}

async function autoUpdateData() {
    await updateData();
    lastUpdate = new Date();
    nextUpdate = new Date(lastUpdate.getTime() + 60000);
    updateFooter();
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
        let now = new Date();
        let secs = nextUpdate ? Math.max(0, Math.round((nextUpdate - now) / 1000)) : 60;
        let cd = document.getElementById('countdown');
        if (cd) cd.textContent = secs;
        if (secs <= 0) {
            clearInterval(countdownInterval);
            autoUpdateData();
        }
    }, 1000);
}



// Initial load
autoUpdateData();

// Tool Info modal logic
document.addEventListener('DOMContentLoaded', function() {
    var btn = document.getElementById('tool-info-btn');
    var modal = document.getElementById('tool-info-modal');
    var closeBtn = document.getElementById('close-tool-info');
    // Always hide modal on load
    if (modal) modal.style.display = 'none';
    if (btn && modal && closeBtn) {
        btn.onclick = function() { modal.style.display = 'flex'; };
        closeBtn.onclick = function() { modal.style.display = 'none'; };
        modal.onclick = function(e) { if (e.target === modal) modal.style.display = 'none'; };
    }

    // --- Specialty Summary Logging Buttons ---
    var startBtn = document.getElementById('start-log-btn');
    var stopBtn = document.getElementById('stop-log-btn');
    var downloadBtn = document.getElementById('download-log-btn');
    function updateLogButtons() {
        if (specialtyLogActive) {
            startBtn.style.display = 'none';
            stopBtn.style.display = '';
            downloadBtn.style.display = '';
        } else {
            startBtn.style.display = '';
            stopBtn.style.display = 'none';
            downloadBtn.style.display = specialtyLog.length > 1 ? '' : 'none';
        }
    }
    if (startBtn && stopBtn && downloadBtn) {
        startBtn.onclick = function() {
            specialtyLogActive = true;
            specialtyLog = [];
            updateLogButtons();
        };
        stopBtn.onclick = function() {
            specialtyLogActive = false;
            updateLogButtons();
        };
        downloadBtn.onclick = function() {
            if (specialtyLog.length > 1) {
                let csv = specialtyLog.map(row => row.map(cell => '"'+cell.toString().replace(/"/g,'""')+'"').join(",")).join("\r\n");
                let blob = new Blob([csv], {type: 'text/csv'});
                let url = URL.createObjectURL(blob);
                let a = document.createElement('a');
                a.href = url;
                a.download = 'specialty_summary_log.csv';
                document.body.appendChild(a);
                a.click();
                setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
            }
        };
        updateLogButtons();
    }
});
