import { ColumnRenderer } from './core/ColumnRenderer.js';
import { FluxPingPongBuffer } from './core/FluxPingPongBuffer.js';
import { FluxUpdateRenderer } from './core/FluxUpdateRenderer.js';
import { HeightUpdateRenderer } from './core/HeightUpdateRenderer.js';
import { TextureBlitRenderer } from './core/TextureBlitRenderer.js';
import { MinimapRenderer } from './core/MinimapRenderer.js';
import { WaterPingPongBuffer } from './core/WaterPingPongBuffer.js';
import { buildWaterHeightTexture } from './core/WaterHeightTextureBuilder.js';
import { Camera } from './camera/Camera.js';
import { CameraController } from './camera/CameraController.js';
import { updateDynamicClipping } from './camera/dynamicClipping.js';
import { TerrainMeshRenderer } from './core/TerrainMeshRenderer.js';
import { WaterMeshRenderer } from './core/WaterMeshRenderer.js';
import { buildTerrainHeightTextureFromSampler } from './core/TerrainHeightTextureBuilder.js';
import { proceduralHeightSampler, heightfieldSampler } from './geo/MireiaTerrainMesh.js';
import { BuildingMeshRenderer } from './core/BuildingMeshRenderer.js';
import { prepareBuildings, rasterizeBuildingCoverage, buildBuildingGeometry, placeBuildingGeometry } from './geo/osmBuildings.js';
import { buildBuildingMaskTextures, deleteBuildingMaskTextures } from './core/BuildingMaskTextureBuilder.js';
import { initUI } from './ui.js';
import { createImageTexture } from './geo/terrainUtils.js';
import { TerrainController } from './terrain/TerrainController.js';

const DEFAULT_COLUMN_COUNT = 100;
const MIN_COLUMN_COUNT = 4;
const MAX_COLUMN_COUNT = 400;
const DEFAULT_WORLD_WIDTH = 200.0;
const DEFAULT_DAMPING = 0.88;
const DEFAULT_DT = 0.02;
const CFL_NUMBER = 0.5;
const GRAVITY = 9.8;
const DEFAULT_TERRAIN_HEIGHT_SCALE = 10.0;
const DEFAULT_TERRAIN_SEED = 1;
const DEFAULT_DROP_WIDTH = 20.0;
const DEFAULT_DROP_VOLUME_M3 = 800;
// Water mass check (debug). Every readback stalls the GPU: 1 = every substep, 0 = off.
const MASS_CHECK_EVERY_N_STEPS = 0;
const MASS_TOLERANCE = 1e-4;   // allowed relative drift from the starting volume
const WATER_COLOR = [0.3, 0.6, 1.0];
const OUTLINE_COLOR = [0.05, 0.15, 0.3];
const TERRAIN_COLOR = [0.45, 0.35, 0.25];
const BUILDING_COLOR = [0.72, 0.70, 0.68];
const WATER_COLOR_MODES = { none: 0, depth: 1, velocity: 2, flux: 3 };

// Rain has no starting drop to size substeps from, so the CFL depth comes from a periodic max-depth readback.
const MAX_DEPTH_READ_EVERY_N_FRAMES = 30;
// Auto legend: measure the real water now and then instead of only estimating from the starting drop.
const AUTO_RANGE_READ_EVERY_N_FRAMES = 30;
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
const buildingMeshRenderer = new BuildingMeshRenderer(gl);

// Simulation and terrain settings controlled by the panel.
const params = {
    columnCount: DEFAULT_COLUMN_COUNT, // derived from cellSize and the world width (see columnCountFor)
    cellSize: DEFAULT_WORLD_WIDTH / DEFAULT_COLUMN_COUNT, // m, what the panel slider sets
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
    // Legend range per quantity: auto estimate or a typed-in value, remembered when you switch quantities.
    waterRanges: {
        depth: { auto: true, max: 1 },
        velocity: { auto: true, max: 1 },
        flux: { auto: true, max: 1 },
    },
    terrainSource: 'procedural',
    centerLat: 45.8326,
    centerLon: 6.8652,
    showImagery: true,
    showMinimaps: true,
    useBuildings: false,      // OSM buildings raise the terrain, so water flows around them
    openBoundary: false,      // false = water stays inside (closed walls), true = water flows out of the borders
};

// Building footprints (meters from the area's south-west corner), fetched for one area and world width.
const buildings = { list: [], geometry: null, worldWidth: 0, areaKey: '', maxHeight: 0, skipped: 0, loading: false, progress: '', error: null };

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
    const terrainHeight = (params.terrainSource === 'real' && realTerrain.heightfield)
        ? realTerrain.reliefMeters
        : params.terrainHeightScale;
    return terrainHeight + (activeBuildings().length > 0 ? buildings.maxHeight : 0);
}

// Buildings only count when enabled and fetched for the current world width.
function activeBuildings() {
    return (params.useBuildings && buildings.worldWidth === activeWorldWidth) ? buildings.list : [];
}

// The grid has N x N columns, so the column size is the world width / N. The panel sets the size in meters and
// N follows (rounded, within the limits), which keeps the resolution when the world width changes.
function columnCountFor(worldWidth) {
    return Math.max(MIN_COLUMN_COUNT, Math.min(MAX_COLUMN_COUNT, Math.round(worldWidth / params.cellSize)));
}

// The drawn buildings follow the same prepared footprints as the simulation terrain.
function refreshBuildingMesh() {
    const list = activeBuildings();
    if (list.length === 0 || !buildings.geometry) {
        buildingMeshRenderer.clear();
        return;
    }
    buildingMeshRenderer.setGeometry(placeBuildingGeometry(buildings.geometry, list), buildings.geometry.normals);
}

const areaKey = () => `${params.centerLat}|${params.centerLon}|${activeWorldWidth}`;

function setBuildings(list) {
    buildings.list = list;
    buildings.worldWidth = activeWorldWidth;
    buildings.areaKey = areaKey();
    buildings.maxHeight = list.reduce((max, b) => Math.max(max, b.height), 0);
    buildings.geometry = buildBuildingGeometry(list, activeWorldWidth);
    buildings.skipped = buildings.geometry.skipped; // footprints the Mireia extruder could not build
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
    const ground = getCurrentHeightSampler(worldWidth);
    const list = activeBuildings();
    prepareBuildings(list, ground);
    const coverage = rasterizeBuildingCoverage(list, columnCount, worldWidth);
    const masks = buildBuildingMaskTextures(gl, columnCount, coverage);
    let openWorldArea = 0;
    for (const fraction of coverage.cellArea) openWorldArea += fraction;
    return {
        waterPPB: new WaterPingPongBuffer(gl, columnCount),
        fluxPPB: new FluxPingPongBuffer(gl, columnCount),
        columnRenderer: new ColumnRenderer(gl, columnCount),
        terrainTexture: buildTerrainHeightTextureFromSampler(gl, columnCount, worldWidth, ground),
        cellAreaTexture: masks.cellArea,
        edgeOpenTexture: masks.edgeOpen,
        openArea: coverage.cellArea,
        openWorldArea,
    };
}

// Rebuild the simulation and visual mesh together after terrain or grid changes.
function rebuildTerrainAndSim() {
    sim.columnRenderer.dispose();
    sim.waterPPB.dispose();
    sim.fluxPPB.dispose();
    gl.deleteTexture(sim.terrainTexture);
    deleteBuildingMaskTextures(gl, { cellArea: sim.cellAreaTexture, edgeOpen: sim.edgeOpenTexture });
    sim = buildSimResources(params.columnCount, activeWorldWidth);
    terrainMeshRenderer.buildFromSampler(getCurrentHeightSampler(activeWorldWidth), activeWorldWidth, params.columnCount);
    cameraController.setHeightSampler(getCurrentHeightSampler(activeWorldWidth));
    cameraController.setMaxPickDistance(Math.max(4000, activeWorldWidth * 3));
    resourceColumnCount = params.columnCount;
    idleSeedKey = null;
    applyImageryTexture();
    refreshBuildingMesh();
}

// One imagery texture is shared by both terrain renderers; showImagery toggles it.
let imageryTexture = null;
function replaceImagery(canvasImage) {
    if (imageryTexture) gl.deleteTexture(imageryTexture);
    imageryTexture = createImageTexture(gl, canvasImage);
}

function clearImagery() {
    if (imageryTexture) gl.deleteTexture(imageryTexture);
    imageryTexture = null;
}

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
function resetSimulation(waterPPB, fluxPPB, columnCount, dropStartCol, dropEndCol, dropStartRow, dropEndRow, dropDepth, openArea) {
    const seedTexture = buildWaterHeightTexture(gl, columnCount, dropStartCol, dropEndCol, dropStartRow, dropEndRow, dropDepth, openArea);
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
    const depths = buffer._readPixels();
    const cellArea = (activeWorldWidth / buffer.columnCount) ** 2;
    let volume = 0;
    for (let i = 0; i < sim.openArea.length; i++) volume += depths[i * 4] * sim.openArea[i] * cellArea;
    return volume;
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
terrainMeshRenderer.buildFromSampler(getCurrentHeightSampler(activeWorldWidth), activeWorldWidth, params.columnCount);
let resourceColumnCount = params.columnCount;
let state = SimState.IDLE;
const minimapRenderer = new MinimapRenderer(gl, canvas, {
    params,
    terrainMeshRenderer,
    waterMeshRenderer,
    waterColorModes: WATER_COLOR_MODES,
    terrainColor: TERRAIN_COLOR,
    waterColor: WATER_COLOR,
    gravity: GRAVITY,
    getWorldWidth: () => activeWorldWidth,
    getTerrainTexture: () => sim.terrainTexture,
    getColumnCount: () => params.columnCount,
});

const terrainController = new TerrainController({
    params,
    buildings,
    realTerrain,
    getState: () => state,
    idleState: SimState.IDLE,
    getActiveWorldWidth: () => activeWorldWidth,
    setActiveWorldWidth: (width) => { activeWorldWidth = width; },
    columnCountFor,
    setBuildings,
    rebuildTerrainAndSim,
    frameCamera,
    replaceImagery,
    clearImagery,
    getUI: () => ui,
    incrementTerrainSeed: () => { terrainSeed++; },
});

// Control panel lives in ui.js; it reads/writes params and calls the actions below.
const ui = initUI({
    params,
    realTerrain,
    buildings,
    hasBuildings: terrainController.hasBuildingsForArea,
    SimState,
    getState: () => state,
    getActiveWorldWidth: () => activeWorldWidth,
    hasImagery: () => !!imageryTexture,
    actions: {
        pullBuildings: () => terrainController.pullBuildings(),
        applyBuildings: () => terrainController.applyBuildings(),
        applyImagery: applyImageryTexture,
        start: startSim,
        stop: stopSim,
        remove: deleteSim,
        toggleRain,
        regenerateTerrain: () => terrainController.regenerateTerrain(),
        loadRealTerrain: () => terrainController.loadRealTerrain(),
    },
});

// Start resets the drop; stop freezes it; delete returns to the live preview.
function startSim() {
    if (state !== SimState.IDLE) return;
    const isRain = params.mode === 'rain';
    const { dropStartCol, dropEndCol, dropStartRow, dropEndRow, dropDepth } = computeDropRegion();
    resetSimulation(sim.waterPPB, sim.fluxPPB, params.columnCount, dropStartCol, dropEndCol, dropStartRow, dropEndRow, isRain ? 0 : dropDepth, sim.openArea);
    initialWaterVolume = measureWaterVolume();
    stepCounter = 0;
    resetRainStats();
    minimapRenderer.resetMeasuredRange();
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
    minimapRenderer.resetMeasuredRange();
}

// Convert the requested drop into grid cells and depth for its actual footprint.
function computeDropRegion() {
    // Before a run the grid follows the column size from the panel; while running it stays fixed.
    if (state === SimState.IDLE) params.columnCount = columnCountFor(activeWorldWidth);
    const columnWidth = activeWorldWidth / params.columnCount;
    const half = params.dropWidth / 2;
    const clampIndex = (v) => Math.max(0, Math.min(params.columnCount, v));

    const dropStartCol = clampIndex(Math.floor((params.dropPositionX - half) / columnWidth));
    const dropEndCol = Math.max(dropStartCol, clampIndex(Math.ceil((params.dropPositionX + half) / columnWidth)));
    const dropStartRow = clampIndex(Math.floor((params.dropPositionY - half) / columnWidth));
    const dropEndRow = Math.max(dropStartRow, clampIndex(Math.ceil((params.dropPositionY + half) / columnWidth)));

    const dropSizeX = (dropEndCol - dropStartCol) * columnWidth;
    const dropSizeY = (dropEndRow - dropStartRow) * columnWidth;
    let openCells = 0;
    for (let row = dropStartRow; row < dropEndRow; row++) {
        for (let col = dropStartCol; col < dropEndCol; col++) openCells += sim.openArea[row * params.columnCount + col];
    }
    const dropFootprint = openCells * columnWidth * columnWidth;
    const dropDepth = dropFootprint > 0 ? params.dropVolumeM3 / dropFootprint : 0;

    return { columnWidth, dropStartCol, dropEndCol, dropStartRow, dropEndRow, dropSizeX, dropSizeY, dropDepth };
}


// Latest measured legend max per quantity (0 = nothing measured yet, so the estimate is used).
// Advance simulation state, render the scene, then schedule the next frame.
function frame() {
    resizeCanvas();

    if (state === SimState.IDLE) {
        const desiredColumnCount = columnCountFor(activeWorldWidth);
        if (desiredColumnCount !== resourceColumnCount) {
            params.columnCount = desiredColumnCount;
            rebuildTerrainAndSim();
        }
    }
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

    // Auto legend: only measure when something on screen actually uses it.
    if (state === SimState.RUNNING && rain.frames % AUTO_RANGE_READ_EVERY_N_FRAMES === 0 &&
        (params.waterColorMode !== 'none' || params.showMinimaps)) {
        minimapRenderer.updateMeasuredRange(
            columnWidth, params.columnCount, sim.waterPPB.current(), sim.fluxPPB.current(),
        );
    }

    // Choose enough substeps to respect the shallow-water CFL limit.
    const maxWaterDepth = isRain ? refDepth * RAIN_CFL_DEPTH_MARGIN : refDepth;
    const waveSpeed = maxWaterDepth > 0 ? Math.sqrt(GRAVITY * maxWaterDepth) : 0;
    const cflDt = waveSpeed > 0 ? CFL_NUMBER * columnWidth / waveSpeed : params.dt;
    const substeps = Math.max(1, Math.ceil(params.dt / cflDt));
    const subDt = params.dt / substeps;
    const substepDamping = Math.pow(params.damping, subDt);

    // IDLE keeps the displayed drop synchronized with its controls.
    if (state === SimState.IDLE) {
        // Only rebuild the seed texture when the drop actually changed.
        const seedKey = `${params.columnCount}|${dropStartCol}|${dropEndCol}|${dropStartRow}|${dropEndRow}|${seedDepth}`;
        if (seedKey !== idleSeedKey) {
            resetSimulation(sim.waterPPB, sim.fluxPPB, params.columnCount, dropStartCol, dropEndCol, dropStartRow, dropEndRow, seedDepth, sim.openArea);
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
                sim.cellAreaTexture, sim.edgeOpenTexture,
                params.columnCount, pipeArea, pipeLength, subDt, substepDamping,
                params.openBoundary ? 1 : 0,
            );
            sim.fluxPPB.next().unbind();
            sim.fluxPPB.swap();

            sim.waterPPB.next().bind();
            heightUpdateRenderer.render(
                sim.waterPPB.current().getTexture(), sim.fluxPPB.current().getTexture(),
                sim.cellAreaTexture,
                params.columnCount, columnArea, subDt, 0,
                0, 0, params.columnCount, params.columnCount, pourRate, // rain = pour over the whole grid
            );
            sim.waterPPB.next().unbind();
            sim.waterPPB.swap();

            rain.simTime += subDt;
            if (pourRate > 0) {
                rain.volume += pourRate * subDt * sim.openWorldArea * columnArea;
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
    const waterRangeMax = minimapRenderer.rangeFor(params.waterColorMode, refDepth);
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
    buildingMeshRenderer.render(viewProj, ...BUILDING_COLOR);
    if (params.waterAsMesh) {
        waterMeshRenderer.render(viewProj, sim.terrainTexture, waterTexture, params.columnCount, activeWorldWidth, ...WATER_COLOR);
    } else {
        sim.columnRenderer.renderWater(sim.terrainTexture, waterTexture, activeWorldWidth, ...WATER_COLOR);
        if (params.showOutline) {
            sim.columnRenderer.renderWaterOutline(sim.terrainTexture, waterTexture, activeWorldWidth, ...OUTLINE_COLOR);
        }
    }

    // After the main view, since this reuses the water mesh renderer with its own coloring.
    const minimapRanges = params.showMinimaps
        ? minimapRenderer.render(waterTexture, fluxTexture, maxSceneHeight + refDepth, refDepth)
        : null;

    const rainStats = {
        active: rain.active,
        simTime: rain.simTime,
        volume: rain.volume,
        depthMm: sim.openWorldArea > 0 ? rain.volume / (sim.openWorldArea * columnArea) * 1000 : 0,
    };
    ui.update(dropInfo, substeps, subDt, waterRangeMax, rainStats, minimapRanges);

    requestAnimationFrame(frame);
}

requestAnimationFrame(frame);