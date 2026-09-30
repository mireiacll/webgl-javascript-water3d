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
import { WaterMeshRenderer } from './core/WaterMeshRenderer.js';
import { buildTerrainHeightTextureFromSampler } from './core/TerrainHeightTextureBuilder.js';
import { proceduralHeightSampler, heightfieldSampler } from './geo/MireiaTerrainMesh.js';
import { MireiaElevationTiles } from './geo/MireiaElevationTiles.js';
import { MireiaTileMosaic } from './geo/MireiaTileMosaic.js';
import { initUI } from './ui.js';
import { computeBboxFromCenter, cropHeightfieldToBbox, cropCanvasToBbox, fillNoDataInPlace, clampSeaLevelInPlace, createImageTexture } from './geo/terrainUtils.js';

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
const SATELLITE_IMAGERY_URL_TEMPLATE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
// Water mass check (debug). Every readback stalls the GPU: 1 = every substep, 0 = off.
const MASS_CHECK_EVERY_N_STEPS = 0;
const MASS_TOLERANCE = 1e-4;   // allowed relative drift from the starting volume
const WATER_COLOR = [0.3, 0.6, 1.0];
const OUTLINE_COLOR = [0.05, 0.15, 0.3];
const TERRAIN_COLOR = [0.45, 0.35, 0.25];
const WATER_COLOR_MODES = { none: 0, depth: 1, velocity: 2, flux: 3 };
// Real flows stay well below critical speed, so the auto legend spans this fraction of it.
const AUTO_RANGE_FRACTION = 0.5;
// Rain has no starting drop to size substeps from, so the CFL depth comes from a periodic max-depth readback.
const MAX_DEPTH_READ_EVERY_N_FRAMES = 30;
const MIN_RAIN_CFL_DEPTH = 0.05;     // m, floor while the ground is still nearly dry
const RAIN_CFL_DEPTH_MARGIN = 1.25;  // headroom for depth growth between readbacks
const MM_PER_HOUR_TO_M_PER_S = 1 / 3.6e6;

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
const waterMeshRenderer = new WaterMeshRenderer(gl);

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
    mode: 'drop',             // drop | rain
    rainMmPerHour: 50,
    rainDurationMin: 0,       // 0 = rain until stopped by hand
    showOutline: true,
    terrainAsMesh: true,
    waterAsMesh: false,
    waterColorMode: 'none',   // none | depth | velocity | flux
    waterRangeAuto: true,
    waterRangeMax: 1,
    terrainSource: 'procedural',
    centerLat: 45.8326,
    centerLon: 6.8652,
    showImagery: true,
};

const realTerrain = {
    heightfield: null,
    gridWidth: 0,
    gridHeight: 0,
    reliefMeters: 0,
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
    idleSeedKey = null;
    applyImageryTexture();
}

// One imagery texture is shared by both terrain renderers; showImagery toggles it.
let imageryTexture = null;
function applyImageryTexture() {
    if (imageryTexture && params.showImagery) {
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

// Total water volume (m^3) read back from the current water texture.
function measureWaterVolume() {
    const buffer = sim.waterPPB.current();
    return buffer.readTotalDepth() * (activeWorldWidth / buffer.columnCount) ** 2;
}

let initialWaterVolume = 0;
// Last drop seeded in IDLE; null forces a re-seed (fresh buffers, or coming back from a run).
let idleSeedKey = null;
let stepCounter = 0;

// Rain bookkeeping. simTime is real-world seconds of simulated time; volume is analytic (rate * time * area).
const rain = { active: false, volume: 0, simTime: 0, segmentTime: 0, maxDepth: 0, frames: 0 };
function resetRainStats() {
    Object.assign(rain, { active: false, volume: 0, simTime: 0, segmentTime: 0, maxDepth: 0, frames: 0 });
}

function checkWaterMass(label, alwaysLog = false) {
    const volume = measureWaterVolume();
    const expected = initialWaterVolume + rain.volume;
    const drift = expected > 0 ? (volume - expected) / expected : 0;
    const ok = Math.abs(drift) <= MASS_TOLERANCE; // false for NaN too
    const msg = `[mass] ${label}: ${volume.toFixed(3)} m^3 (expected ${expected.toFixed(3)}, drift ${(drift * 100).toExponential(2)}%)`;
    if (!ok) console.warn(msg);
    else if (alwaysLog) console.log(msg);
}

let sim = buildSimResources(params.columnCount, activeWorldWidth);
terrainMeshRenderer.buildFromSampler(getCurrentHeightSampler(activeWorldWidth), activeWorldWidth);
let resourceColumnCount = params.columnCount;
let state = SimState.IDLE;

// Control panel lives in ui.js; it reads/writes params and calls the actions below.
const ui = initUI({
    params,
    realTerrain,
    SimState,
    getState: () => state,
    getActiveWorldWidth: () => activeWorldWidth,
    hasImagery: () => !!imageryTexture,
    actions: { applyImagery: applyImageryTexture, start: startSim, stop: stopSim, remove: deleteSim, toggleRain, regenerateTerrain, loadRealTerrain },
});

// Load elevation and optional imagery, then apply them as one terrain update.
async function loadRealTerrain() {
    if (state !== SimState.IDLE || realTerrain.loading) return;

    realTerrain.loading = true;
    realTerrain.error = null;
    ui.updateRealTerrainStatus();

    try {
        const bbox = computeBboxFromCenter(params.centerLon, params.centerLat, params.worldWidth);
        const [raw, imagery] = await Promise.all([
            MireiaElevationTiles.build(bbox),
            MireiaTileMosaic.build(bbox, { urlTemplate: SATELLITE_IMAGERY_URL_TEMPLATE }),
        ]);

        const result = cropHeightfieldToBbox(raw, bbox);
        fillNoDataInPlace(result.heightfield, result.gridWidth, result.gridHeight);
        clampSeaLevelInPlace(result.heightfield);

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

        if (imageryTexture) { gl.deleteTexture(imageryTexture); imageryTexture = null; }
        imageryTexture = createImageTexture(gl, cropCanvasToBbox(imagery.canvas, imagery.zoom, bbox));

        params.terrainSource = 'real';
        activeWorldWidth = params.worldWidth;
        rebuildTerrainAndSim();
        frameCamera();
        ui.syncDropRanges();
    } catch (err) {
        realTerrain.error = err.message;
    } finally {
        realTerrain.loading = false;
        ui.updateRealTerrainStatus();
    }
}

// Start resets the drop; stop freezes it; delete returns to the live preview.
function startSim() {
    if (state !== SimState.IDLE) return;
    const isRain = params.mode === 'rain';
    const { dropStartCol, dropEndCol, dropStartRow, dropEndRow, dropDepth } = computeDropRegion();
    resetSimulation(sim.waterPPB, sim.fluxPPB, params.columnCount, dropStartCol, dropEndCol, dropStartRow, dropEndRow, isRain ? 0 : dropDepth);
    initialWaterVolume = measureWaterVolume();
    stepCounter = 0;
    resetRainStats();
    rain.active = isRain;
    console.log(`[mass] start: measured ${initialWaterVolume.toFixed(3)} m^3, expected ${(isRain ? 0 : params.dropVolumeM3).toFixed(3)} m^3`);
    state = SimState.RUNNING;
}

// Pause or resume the rain while the simulation keeps running.
function toggleRain() {
    if (state !== SimState.RUNNING || params.mode !== 'rain') return;
    rain.active = !rain.active;
    if (rain.active) rain.segmentTime = 0; // the auto-stop timer restarts on each resume
}

function stopSim() {
    if (state !== SimState.RUNNING) return;
    state = SimState.STOPPED;
    checkWaterMass('stop', true);
}

function deleteSim() {
    if (state !== SimState.STOPPED) return;
    state = SimState.IDLE;
    idleSeedKey = null;
    resetRainStats();
}

function regenerateTerrain() {
    if (state !== SimState.IDLE) return;
    params.terrainSource = 'procedural';
    terrainSeed++;
    activeWorldWidth = params.worldWidth;
    if (imageryTexture) { gl.deleteTexture(imageryTexture); imageryTexture = null; }
    rebuildTerrainAndSim();
    frameCamera();
    ui.syncDropRanges();
}


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


// Legend max used when auto range is on, from the reference depth (drop depth, or measured rain depth) (no GPU readback needed).
function autoWaterRange(mode, dropDepth) {
    if (dropDepth <= 0) return 1;
    const critical = Math.sqrt(GRAVITY * dropDepth); // shallow-water wave speed
    if (mode === 'depth') return dropDepth;
    if (mode === 'velocity') return AUTO_RANGE_FRACTION * critical;   // m/s
    if (mode === 'flux') return AUTO_RANGE_FRACTION * critical * dropDepth; // m^2/s
    return 1;
}

// Advance simulation state, render the scene, then schedule the next frame.
function frame() {
    resizeCanvas();

    const dropInfo = computeDropRegion();
    const { columnWidth, dropStartCol, dropEndCol, dropStartRow, dropEndRow, dropDepth } = dropInfo;
    const pipeArea = columnWidth * columnWidth;
    const pipeLength = columnWidth;
    const columnArea = columnWidth * columnWidth;

    const isRain = params.mode === 'rain';
    const seedDepth = isRain ? 0 : dropDepth;
    const rainRate = params.rainMmPerHour * MM_PER_HOUR_TO_M_PER_S; // m/s

    // Rain: measure the deepest column now and then; rain.maxDepth also grows by the rain added since.
    if (state === SimState.RUNNING && isRain && rain.frames % MAX_DEPTH_READ_EVERY_N_FRAMES === 0) {
        rain.maxDepth = sim.waterPPB.current().readMaxDepth();
    }
    const refDepth = isRain ? Math.max(rain.maxDepth, MIN_RAIN_CFL_DEPTH) : dropDepth;

    // Choose enough substeps to respect the shallow-water CFL limit.
    const maxWaterDepth = isRain ? refDepth * RAIN_CFL_DEPTH_MARGIN : refDepth;
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
        // Only rebuild the seed texture when the drop actually changed.
        const seedKey = `${params.columnCount}|${dropStartCol}|${dropEndCol}|${dropStartRow}|${dropEndRow}|${seedDepth}`;
        if (seedKey !== idleSeedKey) {
            resetSimulation(sim.waterPPB, sim.fluxPPB, params.columnCount, dropStartCol, dropEndCol, dropStartRow, dropEndRow, seedDepth);
            idleSeedKey = seedKey;
        }
    }

    // Each step updates flux first, then applies it to water depth.
    if (state === SimState.RUNNING) {
        const rainLimit = params.rainDurationMin * 60;
        for (let step = 0; step < substeps; step++) {
            if (rain.active && rainLimit > 0 && rain.segmentTime >= rainLimit) rain.active = false;
            const pourRate = (isRain && rain.active) ? rainRate : 0;

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
                0, 0, params.columnCount, params.columnCount, pourRate, // rain = pour over the whole grid
            );
            sim.waterPPB.next().unbind();
            sim.waterPPB.swap();

            rain.simTime += subDt;
            if (pourRate > 0) {
                rain.volume += pourRate * subDt * activeWorldWidth ** 2;
                rain.segmentTime += subDt;
                rain.maxDepth += pourRate * subDt;
            }

            stepCounter++;
            if (MASS_CHECK_EVERY_N_STEPS > 0 && stepCounter % MASS_CHECK_EVERY_N_STEPS === 0) {
                checkWaterMass(`step ${stepCounter}`);
            }
        }
        rain.frames++;
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
    const colorMode = WATER_COLOR_MODES[params.waterColorMode] ?? 0;
    const waterRangeMax = Math.max(1e-6, params.waterRangeAuto ? autoWaterRange(params.waterColorMode, refDepth) : params.waterRangeMax);
    const fluxTexture = sim.fluxPPB.current().getTexture();
    sim.columnRenderer.setFluxTexture(fluxTexture);
    sim.columnRenderer.setWaterColoring(colorMode, waterRangeMax);
    waterMeshRenderer.setFluxTexture(fluxTexture);
    waterMeshRenderer.setWaterColoring(colorMode, waterRangeMax);
    if (params.terrainAsMesh) {
        terrainMeshRenderer.render(viewProj, ...TERRAIN_COLOR);
    } else {
        sim.columnRenderer.renderTerrain(sim.terrainTexture, activeWorldWidth, ...TERRAIN_COLOR);
    }
    if (params.waterAsMesh) {
        waterMeshRenderer.render(viewProj, sim.terrainTexture, waterTexture, params.columnCount, activeWorldWidth, ...WATER_COLOR);
    } else {
        sim.columnRenderer.renderWater(sim.terrainTexture, waterTexture, activeWorldWidth, ...WATER_COLOR);
        if (params.showOutline) {
            sim.columnRenderer.renderWaterOutline(sim.terrainTexture, waterTexture, activeWorldWidth, ...OUTLINE_COLOR);
        }
    }

    const rainStats = {
        active: rain.active,
        simTime: rain.simTime,
        volume: rain.volume,
        depthMm: rain.volume / (activeWorldWidth ** 2) * 1000,
    };
    ui.update(dropInfo, substeps, subDt, waterRangeMax, rainStats);

    requestAnimationFrame(frame);
}

requestAnimationFrame(frame);