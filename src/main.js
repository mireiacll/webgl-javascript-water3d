import { ColumnRenderer } from './core/ColumnRenderer.js';
import { FluxPingPongBuffer } from './core/FluxPingPongBuffer.js';
import { FluxUpdateRenderer } from './core/FluxUpdateRenderer.js';
import { HeightUpdateRenderer } from './core/HeightUpdateRenderer.js';
import { TextureBlitRenderer } from './core/TextureBlitRenderer.js';
import { WaterPingPongBuffer } from './core/WaterPingPongBuffer.js';
import { buildWaterHeightTexture } from './core/WaterHeightTextureBuilder.js';
import { Camera } from './camera/Camera.js';
import { CameraController } from './camera/CameraController.js';
import { updateDynamicClipping } from './camera/dynamicClipping.js';
import { TerrainMeshRenderer } from './core/TerrainMeshRenderer.js';
import { buildTerrainHeightTextureFromSampler } from './core/TerrainHeightTextureBuilder.js';
import { proceduralHeightSampler, heightfieldSampler } from './geo/MireiaTerrainMesh.js';
import { MireiaElevationTiles } from './geo/MireiaElevationTiles.js';

const DEFAULT_COLUMN_COUNT = 100;           // columns per SIDE - the tank is columnCount x columnCount
const DEFAULT_WORLD_WIDTH = 200.0;          // side of the square tank in meters - column width is derived as worldWidth / columnCount
const DEFAULT_DAMPING = 0.88;               // per-frame flux bleed, 1.0 = none
const DEFAULT_DT = 0.02;                    // fixed sim step per frame - this IS the simulation speed control
const CFL_NUMBER = 0.5;
const GRAVITY = 9.8;
const DEFAULT_TERRAIN_HEIGHT_SCALE = 10.0;  // height of the tallest terrain peak
const DEFAULT_TERRAIN_SEED = 1;
const DEFAULT_DROP_WIDTH = 20.0;            // side of the dropped square water block, in meters
const DEFAULT_DROP_VOLUME_M3 = 6000;
// Position and drop-width scale linearly with activeWorldWidth (see
// syncDropRangesToActiveWidth) because they're lengths. Volume has to scale as the
// CUBE of width instead: depth = volume / footprint, and footprint alone already
// scales as width^2, so leaving volume's max fixed means a small tank can get a
// thousand-meters-deep splash while a big tank can't get a visible one at all. This
// constant is picked so the max stays exactly 100000 m^3 at the current default
// worldWidth (200m) - nothing changes unless the tank size does.
const DROP_VOLUME_MAX_DEPTH_FRACTION = 100000 / (DEFAULT_WORLD_WIDTH ** 3);
const WATER_COLOR = [0.3, 0.6, 1.0];
const OUTLINE_COLOR = [0.05, 0.15, 0.3];
const TERRAIN_COLOR = [0.45, 0.35, 0.25];

const SimState = { IDLE: 'IDLE', RUNNING: 'RUNNING', STOPPED: 'STOPPED' };

// ---- canvas + GL context ----
const canvas = document.getElementById('glCanvas');
const gl = canvas.getContext('webgl2');
if (!gl) {
    throw new Error('WebGL2 is not available in this browser');
}
if (!gl.getExtension('EXT_color_buffer_float')) {
    throw new Error('EXT_color_buffer_float is required (float render targets) and is not supported here');
}
// the sim passes render into FBOs with no depth buffer, so the depth test is a no-op for them -
// it only matters for the final column draw
gl.enable(gl.DEPTH_TEST);
gl.depthFunc(gl.GEQUAL);   // near now stores the LARGER value, so "closer" wins with >=
gl.clearDepth(0.0);        // far/empty is now 0, not 1

function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const width = Math.round(canvas.clientWidth * dpr);
    const height = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ---- renderers that don't depend on column count ----
const textureBlit = new TextureBlitRenderer(gl); // used only to blit the seed texture into WaterFBO
const fluxUpdateRenderer = new FluxUpdateRenderer(gl);
const heightUpdateRenderer = new HeightUpdateRenderer(gl);
const terrainMeshRenderer = new TerrainMeshRenderer(gl); // draws the terrain as a real mesh - ColumnRenderer now only draws water

// ---- editable run parameters ----
const params = {
    columnCount: DEFAULT_COLUMN_COUNT,
    worldWidth: DEFAULT_WORLD_WIDTH,
    damping: DEFAULT_DAMPING,
    dt: DEFAULT_DT,
    terrainHeightScale: DEFAULT_TERRAIN_HEIGHT_SCALE,
    dropPositionX: DEFAULT_WORLD_WIDTH / 2,  // meters, where the water block is centered
    dropPositionY: DEFAULT_WORLD_WIDTH / 2,
    dropWidth: DEFAULT_DROP_WIDTH,           // meters, side of the square block
    dropVolumeM3: DEFAULT_DROP_VOLUME_M3,    // total water in the block - depth is derived from this + the block's footprint
    showOutline: true,
    terrainAsMesh: true,                     // true = TerrainMeshRenderer (smooth), false = ColumnRenderer's old instanced boxes
    terrainSource: 'procedural',             // 'procedural' or 'real' - see getCurrentHeightSampler()
    centerLat: 45.8326,                      // default: Mont Blanc area - dramatic relief, easy to see it worked
    centerLon: 6.8652,
    // real-terrain fetches use worldWidth itself as the real-world patch size (see
    // loadRealTerrainBtn below) - the tank's physical size and the area fetched from
    // the map are the same number, so there's nothing left to keep in sync separately.
};

// populated once MireiaElevationTiles.build() succeeds - heightfield is normalized so
// its own minimum sits at 0 (real elevation is an absolute altitude, e.g. ~700-4800m
// here, which means nothing to the sim; only the RELIEF - the shape - matters)
const realTerrain = {
    heightfield: null,
    gridWidth: 0,
    gridHeight: 0,
    reliefMeters: 0,   // max - min of the fetched patch, used for camera far-plane sizing
    minElevation: 0,   // the raw altitude that was subtracted off, kept only for the status display
    hadNoData: false,  // true if some cells were void and got filled in from neighbors
    hadOcean: false,   // true if some cells were real bathymetry, clamped to sea level (0)
    loading: false,
    error: null,
};

// Both the sim's terrain texture and the visual mesh read through this so they can
// never disagree about the ground's shape, whichever source is active. Takes width
// explicitly (rather than reading params.worldWidth) so it always samples at the width
// that's actually being generated, even if the World width slider has moved since.
function getCurrentHeightSampler(worldWidth) {
    if (params.terrainSource === 'real' && realTerrain.heightfield) {
        return heightfieldSampler(realTerrain.heightfield, realTerrain.gridWidth, realTerrain.gridHeight, worldWidth, worldWidth);
    }
    return proceduralHeightSampler(worldWidth, params.terrainHeightScale, terrainSeed);
}

// Approximates a square bounding box in lon/lat around a center point, sized so its
// real-world extent is roughly widthMeters x widthMeters. This is a flat-earth
// approximation (111.32 km/degree of latitude, longitude compressed by cos(latitude))
// - fine for a tank a few hundred meters across, but it drifts at high latitudes or
// large widths. MireiaGlobe.js's UTM reprojection is the rigorous version of this, if
// that precision is ever needed here.
function computeBboxFromCenter(centerLon, centerLat, widthMeters) {
    const METERS_PER_DEGREE_LAT = 111320;
    const dLat = (widthMeters / 2) / METERS_PER_DEGREE_LAT;
    const dLon = (widthMeters / 2) / (METERS_PER_DEGREE_LAT * Math.cos(centerLat * Math.PI / 180));
    const minX = centerLon - dLon, maxX = centerLon + dLon;
    const minY = centerLat - dLat, maxY = centerLat + dLat;
    return { getMinX: () => minX, getMaxX: () => maxX, getMinY: () => minY, getMaxY: () => maxY };
}

// -32768 (the standard 16-bit no-data sentinel) isn't the only garbage value coming
// back - a later load showed -16109 with no -32768 in sight, so the source (or a bug
// in decoding it) is producing different bogus numbers for missing/void cells on
// different requests, not one consistent flag value. Chasing each one individually is a
// losing game, so this checks PLAUSIBILITY instead - but the bounds only need to catch
// numbers that are physically impossible, not just "unusual": real bathymetry near a
// coastline is legitimately negative (down to ~-11000m at the Mariana Trench), and
// clamping that away as "no data" was itself the bug - it flood-filled genuine deep-
// water cells from whatever shallow/coastal cell happened to be nearby, producing a
// flat plateau with a fake cliff at the boundary. So: only flood-fill values outside a
// generous physically-impossible range; genuine negative (ocean) values that survive
// this filter get clamped to sea level separately below, not treated as missing.
const MIN_PLAUSIBLE_METERS = -12000; // below the Mariana Trench (~-11034m) - only sentinel garbage lives past this
const MAX_PLAUSIBLE_METERS = 9500;   // above Everest (~8849m) - only sentinel garbage lives past this
function fillNoDataInPlace(heightfield, gridWidth, gridHeight) {
    const isNoData = (v) => v < MIN_PLAUSIBLE_METERS || v > MAX_PLAUSIBLE_METERS;
    const total = heightfield.length;
    const visited = new Uint8Array(total);
    const queue = new Int32Array(total);
    let queueEnd = 0;
    let validCount = 0;

    for (let i = 0; i < total; i++) {
        if (!isNoData(heightfield[i])) {
            visited[i] = 1;
            queue[queueEnd++] = i;
            validCount++;
        }
    }
    if (validCount === total) return false; // nothing to fill
    if (validCount === 0) {
        throw new Error('fetched elevation is entirely no-data - try a different location or a smaller width');
    }

    for (let head = 0; head < queueEnd; head++) {
        const idx = queue[head];
        const x = idx % gridWidth;
        const y = (idx / gridWidth) | 0;
        if (x > 0 && !visited[idx - 1]) { visited[idx - 1] = 1; heightfield[idx - 1] = heightfield[idx]; queue[queueEnd++] = idx - 1; }
        if (x < gridWidth - 1 && !visited[idx + 1]) { visited[idx + 1] = 1; heightfield[idx + 1] = heightfield[idx]; queue[queueEnd++] = idx + 1; }
        if (y > 0 && !visited[idx - gridWidth]) { visited[idx - gridWidth] = 1; heightfield[idx - gridWidth] = heightfield[idx]; queue[queueEnd++] = idx - gridWidth; }
        if (y < gridHeight - 1 && !visited[idx + gridWidth]) { visited[idx + gridWidth] = 1; heightfield[idx + gridWidth] = heightfield[idx]; queue[queueEnd++] = idx + gridWidth; }
    }
    return true;
}

// Real bathymetry (post no-data fill, so this only sees genuine data, not sentinel
// garbage) is still negative - the tank doesn't model actual ocean depth, so any
// underwater cell just becomes flat sea level. Returns true if anything was clamped,
// so the status display can tell the person their patch included water.
function clampSeaLevelInPlace(heightfield) {
    let clamped = false;
    for (let i = 0; i < heightfield.length; i++) {
        if (heightfield[i] < 0) {
            heightfield[i] = 0;
            clamped = true;
        }
    }
    return clamped;
}

// width of the last GENERATED area - decoupled from params.worldWidth (the live slider)
// until "Random" or "Pull from real life" applies it; see frameCamera below
let activeWorldWidth = params.worldWidth;
let terrainSeed = DEFAULT_TERRAIN_SEED;

// ---- camera ----
const camera = new Camera();
const cameraController = new CameraController(canvas, camera);

// Height of the terrain's own vertical range for whichever source is active - shared by
// camera framing, the pan/orbit/zoom pick plane, and far-clip sizing so none of them can
// drift out of sync with what's actually on screen (that mismatch is what buried the
// camera when real terrain's relief wasn't accounted for anywhere but the far plane).
function currentSceneHeight() {
    return (params.terrainSource === 'real' && realTerrain.heightfield)
        ? realTerrain.reliefMeters
        : params.terrainHeightScale;
}

// Frames the camera on the tank using activeWorldWidth and the current scene height.
// Reused (not just called once at startup) because activeWorldWidth and the terrain's
// height range can both jump a lot in one click - loading real terrain can make the tank
// 10x+ wider and its relief far taller than the flat procedural default. Without
// re-framing after that jump, the camera stays where it was sized for the OLD tank and
// ends up buried inside the new terrain or pressed right up against it - which reads as
// "everything disappeared" (near-plane clipping/backface culling eating the whole
// scene), not as a rendering bug.
function frameCamera() {
    const sceneHeight = currentSceneHeight();
    camera.lookAt(
        [activeWorldWidth / 2, activeWorldWidth / 2, sceneHeight * 0.5],
        activeWorldWidth * 1.1, 0, -0.7,
    );
}
frameCamera();

// builds the column-count-sized resources
function buildSimResources(columnCount, worldWidth) {
    return {
        waterPPB: new WaterPingPongBuffer(gl, columnCount),
        fluxPPB: new FluxPingPongBuffer(gl, columnCount),
        columnRenderer: new ColumnRenderer(gl, columnCount),
        terrainTexture: buildTerrainHeightTextureFromSampler(gl, columnCount, worldWidth, getCurrentHeightSampler(worldWidth)),
    };
}

// Rebuilds using activeWorldWidth - the width of the LAST generated area, not
// params.worldWidth, which is just whatever the (possibly un-applied) slider shows.
// Called by: a columnCount change (grid resolution only, width/terrain unchanged) AND
// the two generate actions (Random / Pull from real life), which update
// activeWorldWidth themselves before calling this - so terrain texture and visual mesh
// are always rebuilt together and never drift out of sync with each other.
function rebuildTerrainAndSim() {
    sim.columnRenderer.dispose();
    sim.waterPPB.dispose();
    sim.fluxPPB.dispose();
    gl.deleteTexture(sim.terrainTexture);
    sim = buildSimResources(params.columnCount, activeWorldWidth);
    terrainMeshRenderer.buildFromSampler(getCurrentHeightSampler(activeWorldWidth), activeWorldWidth);
    resourceColumnCount = params.columnCount;
}

// (re)seeds the water sim for a fresh run: water depth is 0 everywhere except
// the dropped block (columns [dropStartCol, dropEndCol) x rows [dropStartRow, dropEndRow)),
// which starts uniformly at dropDepth
function resetSimulation(waterPPB, fluxPPB, columnCount, dropStartCol, dropEndCol, dropStartRow, dropEndRow, dropDepth) {
    const seedTexture = buildWaterHeightTexture(gl, columnCount, dropStartCol, dropEndCol, dropStartRow, dropEndRow, dropDepth);
    waterPPB.current().bind();
    textureBlit.render(seedTexture);
    waterPPB.current().unbind();
    gl.deleteTexture(seedTexture); // only needed to seed the buffer above - free it or every reset leaks

    fluxPPB.current().bind();
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    fluxPPB.current().unbind();
}

let sim = buildSimResources(params.columnCount, activeWorldWidth);
terrainMeshRenderer.buildFromSampler(getCurrentHeightSampler(activeWorldWidth), activeWorldWidth);
let resourceColumnCount = params.columnCount;
let state = SimState.IDLE;

// ---- DOM control panel (replaces ImGui) ----
const el = (id) => document.getElementById(id);
const stateLabel = el('stateLabel');
const startBtn = el('startBtn');
const stopBtn = el('stopBtn');
const deleteBtn = el('deleteBtn');
const cflInfo = el('cflInfo');
const columnWidthInfo = el('columnWidthInfo');
const dropDepthInfo = el('dropDepthInfo');
const regenerateTerrainBtn = el('regenerateTerrainBtn');

const lockedWhileRunningIds = [
    'columnCount', 'worldWidth', 'damping',
    'terrainHeightScale', 'regenerateTerrainBtn',
    'dropPositionX', 'dropPositionY', 'dropWidth', 'dropVolumeM3',
    'centerLat', 'centerLon', 'loadRealTerrainBtn',
];

function bindSlider(id, paramKey, format = (v) => v) {
    const input = el(id);
    const valueEl = el(`${id}Value`);
    input.value = params[paramKey];
    valueEl.textContent = format(params[paramKey]);
    input.addEventListener('input', () => {
        params[paramKey] = parseFloat(input.value);
        valueEl.textContent = format(params[paramKey]);
    });
}

bindSlider('dt', 'dt', (v) => v.toFixed(4));
bindSlider('columnCount', 'columnCount', (v) => Math.round(v));
bindSlider('worldWidth', 'worldWidth', (v) => v.toFixed(1));
bindSlider('damping', 'damping', (v) => v.toFixed(3));
bindSlider('terrainHeightScale', 'terrainHeightScale', (v) => v.toFixed(1));
bindSlider('dropPositionX', 'dropPositionX', (v) => v.toFixed(1));
bindSlider('dropPositionY', 'dropPositionY', (v) => v.toFixed(1));
bindSlider('dropWidth', 'dropWidth', (v) => v.toFixed(1));
bindSlider('dropVolumeM3', 'dropVolumeM3', (v) => v.toFixed(0));

// The drop sliders' ranges track the ACTIVE (generated) width, not the staged World
// width slider - dropping only ever makes sense within the area that's actually been
// generated, and a range that moved live with the staged slider would be just as
// misleading as the terrain itself moving live used to be. Called once now, then again
// by the two generate actions whenever activeWorldWidth changes.
function syncDropRangesToActiveWidth() {
    el('dropPositionX').max = String(activeWorldWidth);
    el('dropPositionY').max = String(activeWorldWidth);
    el('dropWidth').max = String(activeWorldWidth);
    el('dropVolumeM3').max = String(Math.round(DROP_VOLUME_MAX_DEPTH_FRACTION * activeWorldWidth ** 3));
}
syncDropRangesToActiveWidth();

el('showOutline').checked = params.showOutline;
el('showOutline').addEventListener('change', (e) => { params.showOutline = e.target.checked; });

el('terrainAsMesh').checked = params.terrainAsMesh;
el('terrainAsMesh').addEventListener('change', (e) => { params.terrainAsMesh = e.target.checked; });

// ---- real terrain (elevation tiles) ----
const loadRealTerrainBtn = el('loadRealTerrainBtn');
const realTerrainStatus = el('realTerrainStatus');

el('centerLat').value = params.centerLat;
el('centerLon').value = params.centerLon;
el('centerLat').addEventListener('input', (e) => { params.centerLat = parseFloat(e.target.value); });
el('centerLon').addEventListener('input', (e) => { params.centerLon = parseFloat(e.target.value); });

function updateRealTerrainStatus() {
    if (realTerrain.loading) {
        realTerrainStatus.textContent = 'Loading elevation tiles...';
    } else if (realTerrain.error) {
        realTerrainStatus.textContent = `Failed to load: ${realTerrain.error}`;
    } else if (realTerrain.heightfield) {
        realTerrainStatus.textContent = `Loaded - relief ${realTerrain.reliefMeters.toFixed(1)} m ` +
            `(${realTerrain.minElevation.toFixed(0)} m to ${(realTerrain.minElevation + realTerrain.reliefMeters).toFixed(0)} m altitude), ` +
            `${realTerrain.gridWidth}x${realTerrain.gridHeight} samples` +
            (realTerrain.hadNoData ? ' (some cells had no data and were filled from neighbors)' : '') +
            (realTerrain.hadOcean ? ' (patch includes ocean, clamped to sea level)' : '');
    } else {
        realTerrainStatus.textContent = 'Not loaded yet';
    }
}
updateRealTerrainStatus();

// "Pull from real life" - one of the two generate actions (the other is "Random").
// Fetches at whatever width is currently staged on the World width slider, and on
// success that staged width becomes the new activeWorldWidth - nothing about the
// tank/camera/drop ranges changes until this resolves and applies together.
loadRealTerrainBtn.addEventListener('click', async () => {
    if (state !== SimState.IDLE || realTerrain.loading) return;

    realTerrain.loading = true;
    realTerrain.error = null;
    updateRealTerrainStatus();

    try {
        const bbox = computeBboxFromCenter(params.centerLon, params.centerLat, params.worldWidth);
        const result = await MireiaElevationTiles.build(bbox);

        const wasFilled = fillNoDataInPlace(result.heightfield, result.gridWidth, result.gridHeight);
        const hadOcean = clampSeaLevelInPlace(result.heightfield);

        let min = Infinity, max = -Infinity;
        for (const h of result.heightfield) {
            if (h < min) min = h;
            if (h > max) max = h;
        }
        const normalized = new Float32Array(result.heightfield.length);
        for (let i = 0; i < result.heightfield.length; i++) normalized[i] = result.heightfield[i] - min;

        realTerrain.heightfield = normalized;
        realTerrain.gridWidth = result.gridWidth;
        realTerrain.gridHeight = result.gridHeight;
        realTerrain.reliefMeters = max - min;
        realTerrain.minElevation = min;
        realTerrain.hadNoData = wasFilled; // some cells were void and got filled from neighbors - see updateRealTerrainStatus
        realTerrain.hadOcean = hadOcean;   // some cells were real bathymetry, clamped to sea level - see updateRealTerrainStatus

        params.terrainSource = 'real';
        activeWorldWidth = params.worldWidth;
        rebuildTerrainAndSim();
        // the tank can be a very different size/height range than whatever the camera
        // was last framed for (especially the first load, still framed for the tiny
        // default tank) - without this the camera can end up buried in the new terrain
        frameCamera();
        syncDropRangesToActiveWidth();
    } catch (err) {
        realTerrain.error = err.message;
        // leave params.terrainSource/activeWorldWidth as whatever they were - a failed
        // load shouldn't silently switch what's currently showing
    } finally {
        realTerrain.loading = false;
        updateRealTerrainStatus();
    }
});

startBtn.addEventListener('click', () => {
    if (state !== SimState.IDLE) return;
    // resources are already sized correctly - the block is already seeded by the
    // IDLE preview each frame, this just kicks off the flux/height passes on it
    const { dropStartCol, dropEndCol, dropStartRow, dropEndRow, dropDepth } = computeDropRegion();
    resetSimulation(sim.waterPPB, sim.fluxPPB, params.columnCount, dropStartCol, dropEndCol, dropStartRow, dropEndRow, dropDepth);
    state = SimState.RUNNING;
});

stopBtn.addEventListener('click', () => {
    if (state !== SimState.RUNNING) return;
    state = SimState.STOPPED;
});

deleteBtn.addEventListener('click', () => {
    if (state !== SimState.STOPPED) return;
    state = SimState.IDLE; // back to IDLE so parameters + preview are live again
});

regenerateTerrainBtn.addEventListener('click', () => {
    if (state !== SimState.IDLE) return;
    params.terrainSource = 'procedural';
    terrainSeed++;
    activeWorldWidth = params.worldWidth;
    rebuildTerrainAndSim();
    frameCamera();
    syncDropRangesToActiveWidth();
});

// the drop is a square block of columns centered on (dropPositionX, dropPositionY).
// uses activeWorldWidth (the actually generated grid), not the staged worldWidth slider
function computeDropRegion() {
    const columnWidth = activeWorldWidth / params.columnCount;
    const half = params.dropWidth / 2;
    const clampIndex = (v) => Math.max(0, Math.min(params.columnCount, v));

    const dropStartCol = clampIndex(Math.floor((params.dropPositionX - half) / columnWidth));
    const dropEndCol = Math.max(dropStartCol, clampIndex(Math.ceil((params.dropPositionX + half) / columnWidth)));
    const dropStartRow = clampIndex(Math.floor((params.dropPositionY - half) / columnWidth));
    const dropEndRow = Math.max(dropStartRow, clampIndex(Math.ceil((params.dropPositionY + half) / columnWidth)));

    // depth needed so that (uniform depth) x (actual quantized footprint) = requested drop volume
    const dropSizeX = (dropEndCol - dropStartCol) * columnWidth;
    const dropSizeY = (dropEndRow - dropStartRow) * columnWidth;
    const dropFootprint = dropSizeX * dropSizeY;
    const dropDepth = dropFootprint > 0 ? params.dropVolumeM3 / dropFootprint : 0;

    return { columnWidth, dropStartCol, dropEndCol, dropStartRow, dropEndRow, dropSizeX, dropSizeY, dropDepth };
}

function updatePanel(dropInfo, substeps, subDt) {
    stateLabel.textContent = `State: ${state}`;

    startBtn.disabled = state !== SimState.IDLE;
    stopBtn.disabled = state !== SimState.RUNNING;
    deleteBtn.disabled = state !== SimState.STOPPED;

    for (const id of lockedWhileRunningIds) {
        el(id).disabled = state !== SimState.IDLE;
    }
    // ignored once real elevation data is active - grey it out so it's not misleading
    el('terrainHeightScale').disabled = el('terrainHeightScale').disabled || params.terrainSource === 'real';

    cflInfo.textContent = `CFL: ${substeps} substep${substeps === 1 ? '' : 's'} per frame (${subDt.toFixed(5)} s each)`;
    columnWidthInfo.textContent = `-> column width d = ${dropInfo.columnWidth.toFixed(3)} m`;
    dropDepthInfo.textContent = `-> depth per column = ${dropInfo.dropDepth.toFixed(3)} m ` +
        `(spanning ${dropInfo.dropEndCol - dropInfo.dropStartCol} x ${dropInfo.dropEndRow - dropInfo.dropStartRow} columns, ` +
        `${dropInfo.dropSizeX.toFixed(1)} x ${dropInfo.dropSizeY.toFixed(1)} m)`;
}

// ---- render loop ----
function frame() {
    resizeCanvas();

    // d is derived, not set directly
    const dropInfo = computeDropRegion();
    const { columnWidth, dropStartCol, dropEndCol, dropStartRow, dropEndRow, dropDepth } = dropInfo;
    const pipeArea = columnWidth * columnWidth;   // d*d
    const pipeLength = columnWidth;                // d
    const columnArea = columnWidth * columnWidth;   // d*d - same d, footprint area

    // Split a requested frame step whenever it exceeds the shallow-water CFL limit.
    const maxWaterDepth = dropDepth;
    const waveSpeed = maxWaterDepth > 0 ? Math.sqrt(GRAVITY * maxWaterDepth) : 0;
    const cflDt = waveSpeed > 0 ? CFL_NUMBER * columnWidth / waveSpeed : params.dt;
    const substeps = Math.max(1, Math.ceil(params.dt / cflDt));
    const subDt = params.dt / substeps;
    const substepDamping = Math.pow(params.damping, subDt);

    if (state === SimState.IDLE) {
        // column count changes buffer SIZE (water/flux resolution) and needs a fresh
        // terrain texture at that resolution too - this still happens live, since it's
        // a grid-resolution change, not a "what area am I looking at" change. worldWidth
        // and terrain source/shape only change via the "Random" / "Pull from real life"
        // buttons now (see those handlers) - not by dragging sliders.
        if (params.columnCount !== resourceColumnCount) {
            rebuildTerrainAndSim();
        }
        // reseeding every IDLE frame with the live slider values doubles as the
        // "preview" - dragging position/width/volume shows the pending block directly,
        // already at the depth it would actually be dropped at
        resetSimulation(sim.waterPPB, sim.fluxPPB, params.columnCount, dropStartCol, dropEndCol, dropStartRow, dropEndRow, dropDepth);
    }

    if (state === SimState.RUNNING) {
        for (let step = 0; step < substeps; step++) {
            sim.fluxPPB.next().bind();
            fluxUpdateRenderer.render(
                sim.waterPPB.current().getTexture(), sim.fluxPPB.current().getTexture(), sim.terrainTexture,
                params.columnCount, pipeArea, pipeLength, subDt, substepDamping,
            );
            sim.fluxPPB.next().unbind();
            sim.fluxPPB.swap();

            sim.waterPPB.next().bind();
            heightUpdateRenderer.render(
                sim.waterPPB.current().getTexture(), sim.fluxPPB.current().getTexture(),
                params.columnCount, columnArea, subDt, 0,
                0, 0, 0, 0, 0,
            );
            sim.waterPPB.next().unbind();
            sim.waterPPB.swap();
        }
    }
    // when STOPPED: skip the two passes above, draw keeps showing the frozen state

    // the pick plane follows the terrain so panning/zooming lands about where you point
    cameraController.groundZ = currentSceneHeight() * 0.5;

    // draw the terrain, then the water on top of it
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.05, 0.05, 0.08, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const maxSceneHeight = currentSceneHeight() + 20;
    updateDynamicClipping(camera, activeWorldWidth, maxSceneHeight);

    const viewProj = camera.getViewProjMatrix(canvas.width / canvas.height);
    sim.columnRenderer.setCamera(viewProj);
    sim.columnRenderer.setGapFraction(params.showOutline ? 0.1 : 0.0);
    const waterTexture = sim.waterPPB.current().getTexture();
    if (params.terrainAsMesh) {
        terrainMeshRenderer.render(viewProj, ...TERRAIN_COLOR);
    } else {
        // old instanced-box path - still reads the same terrain texture the water sim
        // itself uses, so switching the toggle never changes where the water actually sits
        sim.columnRenderer.renderTerrain(sim.terrainTexture, activeWorldWidth, ...TERRAIN_COLOR);
    }
    sim.columnRenderer.renderWater(sim.terrainTexture, waterTexture, activeWorldWidth, ...WATER_COLOR);
    if (params.showOutline) {
        sim.columnRenderer.renderWaterOutline(sim.terrainTexture, waterTexture, activeWorldWidth, ...OUTLINE_COLOR);
    }

    updatePanel(dropInfo, substeps, subDt);

    requestAnimationFrame(frame);
}

requestAnimationFrame(frame);