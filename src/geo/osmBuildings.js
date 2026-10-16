// Buildings from OpenStreetMap (Overpass API): fetch footprints, raise the simulation terrain under them,
// and build the extruded 3D geometry for drawing.
import { MireiaVec2 } from '../math/MireiaVec2.js';
import { MireiaPolygon } from '../geometry/MireiaPolygon.js';
import { MireiaModeler } from '../geometry/MireiaModeler.js';

// Public instances listed on the OSM wiki. The main one is often overloaded (500/502/504), so the loader
// remembers which server last answered and starts with that one.
const OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
export const MAX_BUILDINGS_AREA_METERS = 10000; // 10 x 10 tiles; bigger areas would hammer the shared Overpass servers
const TILE_SIZE_METERS = 1000;   // the area is split into tiles this wide, one request each
const CONCURRENT_REQUESTS = 1;   // one at a time: the public servers give each IP only 1-2 query slots and answer 429 beyond that
const REQUEST_ATTEMPTS = 3;      // passes over the whole server list per tile
const REQUEST_TIMEOUT_SECONDS = 40; // give up on a server that doesn't answer, and try the next one
const DEFAULT_RATE_LIMIT_PAUSE_SECONDS = 10;
const CACHE_NAME = 'osm-buildings-v1'; // browser Cache Storage: tiles are only downloaded once per area

const METERS_PER_LEVEL = 3;
const DEFAULT_HEIGHT = 6;
// Same fallback heights as MireiaDbfReader.TYPE_DEFAULT_HEIGHTS, keyed by the OSM "building" tag.
const TYPE_HEIGHTS = {
    house: 6, residential: 9, apartments: 15, detached: 6, terrace: 7, bungalow: 4, garage: 3, garages: 3,
    shed: 3, hut: 3, greenhouse: 3, summer_house: 4, roof: 3, retail: 6, commercial: 8, industrial: 9,
    warehouse: 9, office: 12, school: 10, university: 12, hospital: 14, church: 18, cathedral: 30,
    hotel: 16, public: 10, civic: 10, train_station: 12, parking: 3, construction: 4,
};

function heightFromTags(tags) {
    const height = parseFloat(tags.height); // also reads "12 m"
    if (height > 0) return height;
    const levels = parseFloat(tags['building:levels']);
    if (levels > 0) return levels * METERS_PER_LEVEL;
    return TYPE_HEIGHTS[tags.building] ?? DEFAULT_HEIGHT;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// How long until this server has a free query slot for us. /api/status lists the free slots and, when all are busy,
// when the next one frees up ("Slot available after: ..., in 25 seconds."). If it can't be read, use a fixed pause.
async function secondsUntilSlot(endpoint) {
    try {
        const text = await (await fetch(endpoint.replace('/interpreter', '/status'))).text();
        if (/[1-9]\d* slots? available now/.test(text)) return 2; // "0 slots available now" must not match
        const waits = [...text.matchAll(/in (\d+) seconds/g)].map((m) => Number(m[1]));
        if (waits.length > 0) return Math.min(Math.min(...waits) + 1, 120);
    } catch {
        // status page not reachable from here: fall through to the default pause
    }
    return DEFAULT_RATE_LIMIT_PAUSE_SECONDS;
}

let preferredEndpoint = 0;

// One request to one server. Throws on HTTP errors, on a timeout, and on "200 OK" answers that carry a runtime error.
async function postQuery(endpoint, query) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_SECONDS * 1000);
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `data=${encodeURIComponent(query)}`,
            signal: controller.signal,
        });
        if (response.status === 429) {
            const error = new Error('429 Too Many Requests (Overpass rate limit)');
            error.rateLimited = true;
            throw error;
        }
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        const json = await response.json();
        // Overpass can answer 200 OK although the query died halfway (timeout, out of memory): the elements are then
        // incomplete and the problem is only reported in "remark". Treat that as a failure so the tile is retried.
        if (json.remark && /runtime error/i.test(json.remark)) throw new Error(json.remark);
        return json;
    } finally {
        clearTimeout(timer);
    }
}

// One Overpass query: tries every server (starting with the one that worked last), and the whole list again with a
// pause if all of them fail. After a 429 (rate limit) it waits until the server says a slot is free.
async function queryOverpass(query, onWait) {
    let lastError = null;
    for (let attempt = 0; attempt < REQUEST_ATTEMPTS; attempt++) {
        let pauseSeconds = 3 * (attempt + 1);
        for (let i = 0; i < OVERPASS_ENDPOINTS.length; i++) {
            const index = (preferredEndpoint + i) % OVERPASS_ENDPOINTS.length;
            const endpoint = OVERPASS_ENDPOINTS[index];
            try {
                const json = await postQuery(endpoint, query);
                preferredEndpoint = index;
                return json;
            } catch (err) {
                lastError = err.name === 'AbortError' ? new Error(`no answer after ${REQUEST_TIMEOUT_SECONDS} s`) : err;
                console.warn(`[osmBuildings] ${new URL(endpoint).host}: ${lastError.message} (pass ${attempt + 1}/${REQUEST_ATTEMPTS})`);
                if (err.rateLimited) pauseSeconds = Math.max(pauseSeconds, await secondsUntilSlot(endpoint));
            }
        }
        if (attempt < REQUEST_ATTEMPTS - 1) {
            onWait?.(pauseSeconds);
            await sleep(pauseSeconds * 1000);
        }
    }
    throw new Error(`Overpass request failed: ${lastError?.message}`);
}

// Same, but a tile that was downloaded before is read from the browser cache (survives page reloads).
async function cachedQuery(query, onWait) {
    const key = new Request(`https://overpass-cache.invalid/${encodeURIComponent(query)}`);
    try {
        const hit = await (await caches.open(CACHE_NAME)).match(key);
        if (hit) return { json: await hit.json(), cached: true };
    } catch {
        // Cache Storage not available (e.g. not a secure context): just download
    }
    const json = await queryOverpass(query, onWait);
    try {
        await (await caches.open(CACHE_NAME)).put(key, new Response(JSON.stringify(json)));
    } catch {
        // not cached, not a problem
    }
    return { json, cached: false };
}

// Runs the async tasks with at most `limit` in flight; the first failure stops the rest from starting.
async function runPool(tasks, limit) {
    let next = 0;
    async function worker() {
        while (next < tasks.length) {
            const task = tasks[next++];
            await task();
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
}

// Footprints inside bbox (lon/lat), converted to meters from the box's south-west corner (x = east, y = north).
// This is the same linear mapping the terrain and imagery use, so everything lines up.
// The area is split into ~1 km tiles (one request each) and the results merged: a building crossing a tile
// border comes back from both tiles, so they are de-duplicated by OSM id.
// Only simple building ways: multipolygon buildings (courtyards) are not included.
export async function fetchOsmBuildings(bbox, worldWidth, onProgress = null) {
    if (worldWidth > MAX_BUILDINGS_AREA_METERS) {
        throw new Error(`area too large for buildings (max ${MAX_BUILDINGS_AREA_METERS} m)`);
    }
    const south = bbox.getMinY(), west = bbox.getMinX(), north = bbox.getMaxY(), east = bbox.getMaxX();
    const spanX = east - west;
    const spanY = north - south;

    const tilesPerSide = Math.max(1, Math.ceil(worldWidth / TILE_SIZE_METERS));
    const queries = [];
    for (let row = 0; row < tilesPerSide; row++) {
        for (let col = 0; col < tilesPerSide; col++) {
            const s = south + spanY * row / tilesPerSide;
            const n = south + spanY * (row + 1) / tilesPerSide;
            const w = west + spanX * col / tilesPerSide;
            const e = west + spanX * (col + 1) / tilesPerSide;
            queries.push(`[out:json][timeout:30];way["building"](${s},${w},${n},${e});out geom qt;`);
        }
    }

    const byId = new Map();
    let done = 0;
    let failed = false;
    const tasks = queries.map((query) => async () => {
        if (failed) return;
        try {
            const { json, cached } = await cachedQuery(query, (seconds) => onProgress?.(done, queries.length, `Overpass is busy, waiting ${seconds} s`));
            console.log(`[osmBuildings] tile ${done + 1}/${queries.length}: ${json.elements?.length ?? 0} building(s)${cached ? ' (from cache)' : ''}`);
            for (const element of json.elements ?? []) {
                if (byId.has(element.id)) continue;
                const building = parseWay(element, west, south, spanX, spanY, worldWidth);
                if (building) byId.set(element.id, building);
            }
        } catch (err) {
            failed = true;
            throw err;
        }
        done++;
        onProgress?.(done, queries.length);
    });
    await runPool(tasks, CONCURRENT_REQUESTS);
    return [...byId.values()];
}

function parseWay(element, west, south, spanX, spanY, worldWidth) {
    if (element.type !== 'way' || !element.geometry) return null;
    const ring = element.geometry.map((g) => ({
        x: (g.lon - west) / spanX * worldWidth,
        y: (g.lat - south) / spanY * worldWidth,
    }));
    if (ring.length > 1 && ring[0].x === ring[ring.length - 1].x && ring[0].y === ring[ring.length - 1].y) ring.pop();
    if (ring.length < 3) return null;
    return { id: element.id, ring, height: heightFromTags(element.tags ?? {}), baseZ: 0, topZ: 0 };
}

// A flat roof sits `height` above the lowest ground under the footprint, so the building never floats on a slope.
export function prepareBuildings(buildings, ground) {
    for (const b of buildings) {
        let lowest = Infinity;
        for (const p of b.ring) lowest = Math.min(lowest, ground(p.x, p.y));
        b.baseZ = lowest;
        b.topZ = lowest + b.height;
    }
}

function pointInRing(x, y, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i], b = ring[j];
        if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
}

// Roof height of every column whose center is inside a footprint (-Infinity elsewhere), row-major like the terrain texture.
export function rasterizeBuildingTops(buildings, columnCount, worldWidth) {
    const tops = new Float32Array(columnCount * columnCount).fill(-Infinity);
    const cell = worldWidth / columnCount;
    const clamp = (v) => Math.max(0, Math.min(columnCount - 1, v));

    for (const b of buildings) {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const p of b.ring) {
            minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
            minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
        }
        const col0 = clamp(Math.floor(minX / cell)), col1 = clamp(Math.floor(maxX / cell));
        const row0 = clamp(Math.floor(minY / cell)), row1 = clamp(Math.floor(maxY / cell));
        for (let row = row0; row <= row1; row++) {
            for (let col = col0; col <= col1; col++) {
                if (!pointInRing((col + 0.5) * cell, (row + 0.5) * cell, b.ring)) continue;
                const i = row * columnCount + col;
                tops[i] = Math.max(tops[i], b.topZ);
            }
        }
    }
    return tops;
}

// Cuts a convex polygon (here: a triangle) to one side of x = bound or y = bound; z is interpolated at the cut.
function clipToSide(polygon, axis, bound, keepGreater) {
    const result = [];
    for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i];
        const b = polygon[(i + 1) % polygon.length];
        const aInside = keepGreater ? a[axis] >= bound : a[axis] <= bound;
        const bInside = keepGreater ? b[axis] >= bound : b[axis] <= bound;
        if (aInside) result.push(a);
        if (aInside !== bInside) {
            const t = (bound - a[axis]) / (b[axis] - a[axis]);
            result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
        }
    }
    return result;
}

// Keeps only the part of a triangle inside the square [0, size] x [0, size]; returns 0 or more triangles.
function clipTriangleToSquare(triangle, size) {
    const inside = triangle.every((p) => p[0] >= 0 && p[0] <= size && p[1] >= 0 && p[1] <= size);
    if (inside) return [triangle];

    let polygon = triangle;
    polygon = clipToSide(polygon, 0, 0, true);
    if (polygon.length >= 3) polygon = clipToSide(polygon, 0, size, false);
    if (polygon.length >= 3) polygon = clipToSide(polygon, 1, 0, true);
    if (polygon.length >= 3) polygon = clipToSide(polygon, 1, size, false);
    if (polygon.length < 3) return [];

    const triangles = [];
    for (let i = 1; i < polygon.length - 1; i++) triangles.push([polygon[0], polygon[i], polygon[i + 1]]);
    return triangles;
}

// Extrude every footprint with the Mireia modeler into flat-shaded triangles (3 vertices per triangle, one normal each).
// Whatever falls outside the square area [0, worldWidth]^2 is cut off, so buildings end at the terrain border.
// Heights are relative to the building's base; placeBuildingGeometry adds the ground level later.
export function buildBuildingGeometry(buildings, worldWidth) {
    const positions = [];
    const normals = [];
    const owner = [];
    let skipped = 0;

    buildings.forEach((b, buildingIndex) => {
        // Skip buildings that lie completely outside the area (no need to extrude them).
        if (b.ring.every((p) => p.x < 0) || b.ring.every((p) => p.x > worldWidth) ||
            b.ring.every((p) => p.y < 0) || b.ring.every((p) => p.y > worldWidth)) return;

        const polygon = MireiaPolygon.tryCreate(b.ring.map((p) => new MireiaVec2(p.x, p.y)));
        if (!polygon) { skipped++; return; }

        let indices, vertices;
        try {
            const modeler = MireiaModeler.extrude(polygon, b.height);
            indices = modeler.getIndices();
            vertices = modeler.getVertices();
        } catch (err) {
            skipped++;
            return;
        }
        if (indices.length % 3 !== 0 || indices.some((i) => i < 0 || i >= vertices.length)) { skipped++; return; }

        let centerX = 0, centerY = 0;
        for (const p of b.ring) { centerX += p.x; centerY += p.y; }
        centerX /= b.ring.length;
        centerY /= b.ring.length;

        for (let t = 0; t < indices.length; t += 3) {
            const p = [0, 1, 2].map((k) => {
                const pos = vertices[indices[t + k]].getPosition();
                return [pos.getX(), pos.getY(), pos.getZ()];
            });
            const ux = p[1][0] - p[0][0], uy = p[1][1] - p[0][1], uz = p[1][2] - p[0][2];
            const vx = p[2][0] - p[0][0], vy = p[2][1] - p[0][1], vz = p[2][2] - p[0][2];
            let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
            const length = Math.hypot(nx, ny, nz);
            if (length < 1e-9) continue;
            nx /= length; ny /= length; nz /= length;

            // Point the normal outward: roofs up, floors down, walls away from the footprint center.
            const cx = (p[0][0] + p[1][0] + p[2][0]) / 3;
            const cy = (p[0][1] + p[1][1] + p[2][1]) / 3;
            const cz = (p[0][2] + p[1][2] + p[2][2]) / 3;
            const flip = Math.abs(nz) > 0.7
                ? (cz > b.height / 2 ? nz < 0 : nz > 0)
                : (nx * (cx - centerX) + ny * (cy - centerY)) < 0;
            if (flip) { nx = -nx; ny = -ny; nz = -nz; }

            for (const piece of clipTriangleToSquare(p, worldWidth)) {
                for (const point of piece) {
                    positions.push(point[0], point[1], point[2]);
                    normals.push(nx, ny, nz);
                    owner.push(buildingIndex);
                }
            }
        }
    });

    if (skipped > 0) console.warn(`[osmBuildings] ${skipped} building(s) skipped (polygon or extrusion failed)`);
    return { positions: new Float32Array(positions), normals: new Float32Array(normals), owner: new Uint32Array(owner), skipped };
}

// Lift each building's vertices to its ground level (baseZ from prepareBuildings).
export function placeBuildingGeometry(geometry, buildings) {
    const placed = new Float32Array(geometry.positions);
    for (let i = 0; i < geometry.owner.length; i++) {
        placed[i * 3 + 2] += buildings[geometry.owner[i]].baseZ;
    }
    return placed;
}