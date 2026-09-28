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
import { MireiaTileMosaic } from './geo/MireiaTileMosaic.js';

const DEFAULT_COLUMN_COUNT = 100;
const DEFAULT_WORLD_WIDTH = 200.0;
const DEFAULT_DAMPING = 0.88;
const DEFAULT_DT = 0.02;
const CFL_NUMBER = 0.5;
const GRAVITY = 9.8;
const DEFAULT_TERRAIN_HEIGHT_SCALE = 10.0;
const DEFAULT_TERRAIN_SEED = 1;
const DEFAULT_DROP_WIDTH = 20.0;
const DEFAULT_DROP_VOLUME_M3 = 800;
const MAX_DROP_DEPTH_FRACTION = 0.05;
const SATELLITE_IMAGERY_URL_TEMPLATE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const WATER_COLOR = [0.3, 0.6, 1.0];
const OUTLINE_COLOR = [0.05, 0.15, 0.3];
const TERRAIN_COLOR = [0.45, 0.35, 0.25];

const SimState = { IDLE: 'IDLE', RUNNING: 'RUNNING', STOPPED: 'STOPPED' };

// Set up WebGL and the render passes shared by the simulation.
const canvas = document.getElementById('glCanvas');
const gl = canvas.getContext('webgl2');
if (!gl) {
    throw new Error('WebGL2 is not available in this browser');
}
if (!gl.getExtension('EXT_color_buffer_float')) {
    throw new Error('EXT_color_buffer_float is required (float render targets) and is not supported here');
}
gl.enable(gl.DEPTH_TEST);
gl.depthFunc(gl.GEQUAL);
gl.clearDepth(0.0);

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

const textureBlit = new TextureBlitRenderer(gl);
const fluxUpdateRenderer = new FluxUpdateRenderer(gl);
const heightUpdateRenderer = new HeightUpdateRenderer(gl);
const terrainMeshRenderer = new TerrainMeshRenderer(gl);

// Simulation and terrain settings controlled by the panel.
const params = {
    columnCount: DEFAULT_COLUMN_COUNT,
    worldWidth: DEFAULT_WORLD_WIDTH,
    damping: DEFAULT_DAMPING,
    dt: DEFAULT_DT,
    terrainHeightScale: DEFAULT_TERRAIN_HEIGHT_SCALE,
    dropPositionX: DEFAULT_WORLD_WIDTH / 2,
    dropPositionY: DEFAULT_WORLD_WIDTH / 2,
    dropWidth: DEFAULT_DROP_WIDTH,
    dropVolumeM3: DEFAULT_DROP_VOLUME_M3,
    showOutline: true,
    terrainAsMesh: true,
    terrainSource: 'procedural',
    centerLat: 45.8326,
    centerLon: 6.8652,
    fetchImagery: false,
};

const realTerrain = {
    heightfield: null,
    gridWidth: 0,
    gridHeight: 0,
    reliefMeters: 0,
    minElevation: 0,
    hadNoData: false,
    hadOcean: false,
    loading: false,
    error: null,
};

// Both the rendered mesh and simulation terrain use this sampler.
function getCurrentHeightSampler(worldWidth) {
    if (params.terrainSource === 'real' && realTerrain.heightfield) {
        return heightfieldSampler(realTerrain.heightfield, realTerrain.gridWidth, realTerrain.gridHeight, worldWidth, worldWidth);
    }
    return proceduralHeightSampler(worldWidth, params.terrainHeightScale, terrainSeed);
}

// Converts a square meter extent to an approximate longitude/latitude box.
function computeBboxFromCenter(centerLon, centerLat, widthMeters) {
    const METERS_PER_DEGREE_LAT = 111320;
    const dLat = (widthMeters / 2) / METERS_PER_DEGREE_LAT;
    const dLon = (widthMeters / 2) / (METERS_PER_DEGREE_LAT * Math.cos(centerLat * Math.PI / 180));
    const minX = centerLon - dLon, maxX = centerLon + dLon;
    const minY = centerLat - dLat, maxY = centerLat + dLat;
    return { getMinX: () => minX, getMaxX: () => maxX, getMinY: () => minY, getMaxY: () => maxY };
}

// Keep real bathymetry; only fill values outside plausible Earth elevations.
const MIN_PLAUSIBLE_METERS = -12000;
const MAX_PLAUSIBLE_METERS = 9500;
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
    if (validCount === total) return false;
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

function createImageTexture(gl, canvas) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
    return texture;
}

let activeWorldWidth = params.worldWidth;
let terrainSeed = DEFAULT_TERRAIN_SEED;

// Camera picking and clipping follow the active terrain bounds.
const camera = new Camera();
const cameraController = new CameraController(canvas, camera);
cameraController.setHeightSampler(getCurrentHeightSampler(activeWorldWidth));
cameraController.setMaxPickDistance(Math.max(4000, activeWorldWidth * 3));

function currentSceneHeight() {
    return (params.terrainSource === 'real' && realTerrain.heightfield)
        ? realTerrain.reliefMeters
        : params.terrainHeightScale;
}

function frameCamera() {
    const sceneHeight = currentSceneHeight();
    camera.lookAt(
        [activeWorldWidth / 2, activeWorldWidth / 2, sceneHeight * 0.5],
        activeWorldWidth * 1.1, 0, -0.7,
    );
}
frameCamera();

// Create buffers for the grid resolution and terrain currently in use.
function buildSimResources(columnCount, worldWidth) {
    return {
        waterPPB: new WaterPingPongBuffer(gl, columnCount),
        fluxPPB: new FluxPingPongBuffer(gl, columnCount),
        columnRenderer: new ColumnRenderer(gl, columnCount),
        terrainTexture: buildTerrainHeightTextureFromSampler(gl, columnCount, worldWidth, getCurrentHeightSampler(worldWidth)),
    };
}

// Rebuild the simulation and visual mesh together after terrain or grid changes.
function rebuildTerrainAndSim() {
    sim.columnRenderer.dispose();
    sim.waterPPB.dispose();
    sim.fluxPPB.dispose();
    gl.deleteTexture(sim.terrainTexture);
    sim = buildSimResources(params.columnCount, activeWorldWidth);
    terrainMeshRenderer.buildFromSampler(getCurrentHeightSampler(activeWorldWidth), activeWorldWidth);
    cameraController.setHeightSampler(getCurrentHeightSampler(activeWorldWidth));
    cameraController.setMaxPickDistance(Math.max(4000, activeWorldWidth * 3));
    resourceColumnCount = params.columnCount;
    applyImageryTexture();
}

// One imagery texture is shared by both terrain renderers.
let imageryTexture = null;
function applyImageryTexture() {
    if (imageryTexture) {
        terrainMeshRenderer.setImageryTexture(imageryTexture);
        sim.columnRenderer.setImageryTexture(imageryTexture);
    } else {
        terrainMeshRenderer.clearImageryTexture();
        sim.columnRenderer.clearImageryTexture();
    }
}

// Seed the drop and clear flux before a run or while previewing in IDLE.
function resetSimulation(waterPPB, fluxPPB, columnCount, dropStartCol, dropEndCol, dropStartRow, dropEndRow, dropDepth) {
    const seedTexture = buildWaterHeightTexture(gl, columnCount, dropStartCol, dropEndCol, dropStartRow, dropEndRow, dropDepth);
    waterPPB.current().bind();
    textureBlit.render(seedTexture);
    waterPPB.current().unbind();
    gl.deleteTexture(seedTexture);

    fluxPPB.current().bind();
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    fluxPPB.current().unbind();
}

let sim = buildSimResources(params.columnCount, activeWorldWidth);
terrainMeshRenderer.buildFromSampler(getCurrentHeightSampler(activeWorldWidth), activeWorldWidth);
let resourceColumnCount = params.columnCount;
let state = SimState.IDLE;

// Bind the control panel to the simulation parameters.
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

// A cubic mapping gives the volume slider more precision near zero.
const DROP_VOLUME_SLIDER_STEPS = 1000;
const DROP_VOLUME_CURVE_EXPONENT = 3;
function currentDropVolumeMax() {
    return MAX_DROP_DEPTH_FRACTION * activeWorldWidth ** 3;
}
function dropVolumeRawToValue(raw) {
    const t = raw / DROP_VOLUME_SLIDER_STEPS;
    return Math.pow(t, DROP_VOLUME_CURVE_EXPONENT) * currentDropVolumeMax();
}
function dropVolumeValueToRaw(value) {
    const max = currentDropVolumeMax();
    const t = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
    return Math.round(Math.pow(t, 1 / DROP_VOLUME_CURVE_EXPONENT) * DROP_VOLUME_SLIDER_STEPS);
}
const dropVolumeInput = el('dropVolumeM3');
const dropVolumeValueEl = el('dropVolumeM3Value');
dropVolumeInput.min = '0';
dropVolumeInput.max = String(DROP_VOLUME_SLIDER_STEPS);
dropVolumeInput.step = '1';
dropVolumeInput.value = String(dropVolumeValueToRaw(params.dropVolumeM3));
dropVolumeValueEl.textContent = params.dropVolumeM3.toFixed(0);
dropVolumeInput.addEventListener('input', () => {
    params.dropVolumeM3 = dropVolumeRawToValue(parseFloat(dropVolumeInput.value));
    dropVolumeValueEl.textContent = params.dropVolumeM3.toFixed(0);
});

function refreshDropVolumeSlider() {
    params.dropVolumeM3 = Math.min(params.dropVolumeM3, currentDropVolumeMax());
    dropVolumeInput.value = String(dropVolumeValueToRaw(params.dropVolumeM3));
    dropVolumeValueEl.textContent = params.dropVolumeM3.toFixed(0);
}

function syncDropRangesToActiveWidth() {
    el('dropPositionX').max = String(activeWorldWidth);
    el('dropPositionY').max = String(activeWorldWidth);
    el('dropWidth').max = String(activeWorldWidth);
    refreshDropVolumeSlider();
}
syncDropRangesToActiveWidth();

el('showOutline').checked = params.showOutline;
el('showOutline').addEventListener('change', (e) => { params.showOutline = e.target.checked; });

el('terrainAsMesh').checked = params.terrainAsMesh;
el('terrainAsMesh').addEventListener('change', (e) => { params.terrainAsMesh = e.target.checked; });

el('fetchImagery').checked = params.fetchImagery;
el('fetchImagery').addEventListener('change', (e) => { params.fetchImagery = e.target.checked; });

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
            (realTerrain.hadOcean ? ' (patch includes ocean, clamped to sea level)' : '') +
            (imageryTexture ? ' + satellite imagery' : '');
    } else {
        realTerrainStatus.textContent = 'Not loaded yet';
    }
}
updateRealTerrainStatus();

// Load elevation and optional imagery, then apply them as one terrain update.
loadRealTerrainBtn.addEventListener('click', async () => {
    if (state !== SimState.IDLE || realTerrain.loading) return;

    realTerrain.loading = true;
    realTerrain.error = null;
    updateRealTerrainStatus();

    try {
        const bbox = computeBboxFromCenter(params.centerLon, params.centerLat, params.worldWidth);
        const [result, imagery] = await Promise.all([
            MireiaElevationTiles.build(bbox),
            params.fetchImagery ? MireiaTileMosaic.build(bbox, { urlTemplate: SATELLITE_IMAGERY_URL_TEMPLATE }) : Promise.resolve(null),
        ]);

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
        realTerrain.hadNoData = wasFilled;
        realTerrain.hadOcean = hadOcean;

        if (imageryTexture) { gl.deleteTexture(imageryTexture); imageryTexture = null; }
        if (imagery) { imageryTexture = createImageTexture(gl, imagery.canvas); }

        params.terrainSource = 'real';
        activeWorldWidth = params.worldWidth;
        rebuildTerrainAndSim();
        frameCamera();
        syncDropRangesToActiveWidth();
    } catch (err) {
        realTerrain.error = err.message;
    } finally {
        realTerrain.loading = false;
        updateRealTerrainStatus();
    }
});

// Start resets the drop; stop freezes it; delete returns to the live preview.
startBtn.addEventListener('click', () => {
    if (state !== SimState.IDLE) return;
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
    state = SimState.IDLE;
});

regenerateTerrainBtn.addEventListener('click', () => {
    if (state !== SimState.IDLE) return;
    params.terrainSource = 'procedural';
    terrainSeed++;
    activeWorldWidth = params.worldWidth;
    if (imageryTexture) { gl.deleteTexture(imageryTexture); imageryTexture = null; }
    rebuildTerrainAndSim();
    frameCamera();
    syncDropRangesToActiveWidth();
});

// Convert the requested drop into grid cells and depth for its actual footprint.
function computeDropRegion() {
    const columnWidth = activeWorldWidth / params.columnCount;
    const half = params.dropWidth / 2;
    const clampIndex = (v) => Math.max(0, Math.min(params.columnCount, v));

    const dropStartCol = clampIndex(Math.floor((params.dropPositionX - half) / columnWidth));
    const dropEndCol = Math.max(dropStartCol, clampIndex(Math.ceil((params.dropPositionX + half) / columnWidth)));
    const dropStartRow = clampIndex(Math.floor((params.dropPositionY - half) / columnWidth));
    const dropEndRow = Math.max(dropStartRow, clampIndex(Math.ceil((params.dropPositionY + half) / columnWidth)));

    const dropSizeX = (dropEndCol - dropStartCol) * columnWidth;
    const dropSizeY = (dropEndRow - dropStartRow) * columnWidth;
    const dropFootprint = dropSizeX * dropSizeY;
    const dropDepth = dropFootprint > 0 ? params.dropVolumeM3 / dropFootprint : 0;

    return { columnWidth, dropStartCol, dropEndCol, dropStartRow, dropEndRow, dropSizeX, dropSizeY, dropDepth };
}

// Refresh state and numeric readouts after each frame.
function updatePanel(dropInfo, substeps, subDt) {
    stateLabel.textContent = `State: ${state}`;

    startBtn.disabled = state !== SimState.IDLE;
    stopBtn.disabled = state !== SimState.RUNNING;
    deleteBtn.disabled = state !== SimState.STOPPED;

    for (const id of lockedWhileRunningIds) {
        el(id).disabled = state !== SimState.IDLE;
    }
    el('terrainHeightScale').disabled = el('terrainHeightScale').disabled || params.terrainSource === 'real';

    cflInfo.textContent = `CFL: ${substeps} substep${substeps === 1 ? '' : 's'} per frame (${subDt.toFixed(5)} s each)`;
    columnWidthInfo.textContent = `-> column width d = ${dropInfo.columnWidth.toFixed(3)} m`;
    dropDepthInfo.textContent = `-> depth per column = ${dropInfo.dropDepth.toFixed(3)} m ` +
        `(spanning ${dropInfo.dropEndCol - dropInfo.dropStartCol} x ${dropInfo.dropEndRow - dropInfo.dropStartRow} columns, ` +
        `${dropInfo.dropSizeX.toFixed(1)} x ${dropInfo.dropSizeY.toFixed(1)} m)`;
}

// Advance simulation state, render the scene, then schedule the next frame.
function frame() {
    resizeCanvas();

    const dropInfo = computeDropRegion();
    const { columnWidth, dropStartCol, dropEndCol, dropStartRow, dropEndRow, dropDepth } = dropInfo;
    const pipeArea = columnWidth * columnWidth;
    const pipeLength = columnWidth;
    const columnArea = columnWidth * columnWidth;

    // Choose enough substeps to respect the shallow-water CFL limit.
    const maxWaterDepth = dropDepth;
    const waveSpeed = maxWaterDepth > 0 ? Math.sqrt(GRAVITY * maxWaterDepth) : 0;
    const cflDt = waveSpeed > 0 ? CFL_NUMBER * columnWidth / waveSpeed : params.dt;
    const substeps = Math.max(1, Math.ceil(params.dt / cflDt));
    const subDt = params.dt / substeps;
    const substepDamping = Math.pow(params.damping, subDt);

    // IDLE keeps the displayed drop synchronized with its controls.
    if (state === SimState.IDLE) {
        if (params.columnCount !== resourceColumnCount) {
            rebuildTerrainAndSim();
        }
        resetSimulation(sim.waterPPB, sim.fluxPPB, params.columnCount, dropStartCol, dropEndCol, dropStartRow, dropEndRow, dropDepth);
    }

    // Each step updates flux first, then applies it to water depth.
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
    // Draw terrain first, then water and its optional outline.
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