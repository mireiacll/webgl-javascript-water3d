import { ColumnRenderer } from './core/ColumnRenderer.js';
import { FluxPingPongBuffer } from './core/FluxPingPongBuffer.js';
import { FluxUpdateRenderer } from './core/FluxUpdateRenderer.js';
import { HeightUpdateRenderer } from './core/HeightUpdateRenderer.js';
import { ScreenRenderer } from './core/ScreenRenderer.js';
import { WaterPingPongBuffer } from './core/WaterPingPongBuffer.js';
import { buildTerrainHeightTexture } from './core/TerrainHeightTextureBuilder.js';
import { buildWaterHeightTexture } from './core/WaterHeightTextureBuilder.js';

const DEFAULT_COLUMN_COUNT = 200;
const DEFAULT_WORLD_WIDTH = 200.0;          // total tank width in meters - column width is derived as worldWidth / columnCount
const DEFAULT_DAMPING = 0.88;               // per-frame flux bleed, 1.0 = none
const DEFAULT_DT = 0.02;                    // fixed sim step per frame - this IS the simulation speed control
const CFL_NUMBER = 0.5;
const GRAVITY = 9.8;
const DEFAULT_MAX_HEIGHT_DISPLAY = 25.0;    // world height (terrain + water) mapped to the top of the window - purely a display setting, doesn't clip the sim
const DEFAULT_TERRAIN_HEIGHT_SCALE = 10.0;  // height of the tallest terrain peak
const DEFAULT_TERRAIN_SEED = 1;
const DEFAULT_DROP_WIDTH = 20.0;            // width of the dropped water block, in meters
const DEFAULT_DROP_AREA_M2 = 300;
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
gl.disable(gl.DEPTH_TEST);

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
const screenRenderer = new ScreenRenderer(gl); // used only to blit the seed texture into WaterFBO
const fluxUpdateRenderer = new FluxUpdateRenderer(gl);
const heightUpdateRenderer = new HeightUpdateRenderer(gl);

// ---- editable run parameters ----
const params = {
    columnCount: DEFAULT_COLUMN_COUNT,
    worldWidth: DEFAULT_WORLD_WIDTH,
    damping: DEFAULT_DAMPING,
    dt: DEFAULT_DT,
    maxHeightDisplay: DEFAULT_MAX_HEIGHT_DISPLAY,
    terrainHeightScale: DEFAULT_TERRAIN_HEIGHT_SCALE,
    dropPositionX: DEFAULT_WORLD_WIDTH / 2,  // meters, where the water block is centered
    dropWidth: DEFAULT_DROP_WIDTH,           // meters
    dropAreaM2: DEFAULT_DROP_AREA_M2,        // cross-sectional area (depth x width) of the block - depth is derived from this + width
    showOutline: true,
};

let terrainSeed = DEFAULT_TERRAIN_SEED;
let regenerateTerrainRequested = false;

// builds the column-count-sized resources - called on startup, on every column
// count change, and on every "Regenerate Terrain" click
function buildSimResources(columnCount, worldWidth, terrainHeightScale, seed) {
    return {
        waterPPB: new WaterPingPongBuffer(gl, columnCount),
        fluxPPB: new FluxPingPongBuffer(gl, columnCount),
        columnRenderer: new ColumnRenderer(gl, columnCount),
        terrainTexture: buildTerrainHeightTexture(gl, columnCount, worldWidth, terrainHeightScale, seed),
    };
}

// (re)seeds the water sim for a fresh run: water depth is 0 everywhere except
// the dropped block [dropStartCol, dropEndCol), which starts uniformly at dropDepth -
// flux starts at zero since there's no meaningful "last frame" yet
function resetSimulation(waterPPB, fluxPPB, columnCount, dropStartCol, dropEndCol, dropDepth) {
    const seedTexture = buildWaterHeightTexture(gl, columnCount, dropStartCol, dropEndCol, dropDepth);
    waterPPB.current().bind();
    screenRenderer.render(seedTexture);
    waterPPB.current().unbind();
    gl.deleteTexture(seedTexture); // only needed to seed the buffer above - free it or every reset leaks

    fluxPPB.current().bind();
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    fluxPPB.current().unbind();
}

let sim = buildSimResources(params.columnCount, params.worldWidth, params.terrainHeightScale, terrainSeed);
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
    'dropPositionX', 'dropWidth', 'dropAreaM2',
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
bindSlider('dropWidth', 'dropWidth', (v) => v.toFixed(1));
bindSlider('dropAreaM2', 'dropAreaM2', (v) => v.toFixed(2));
bindSlider('maxHeightDisplay', 'maxHeightDisplay', (v) => v.toFixed(1));
el('dropPositionX').max = String(params.worldWidth);
el('dropWidth').max = String(params.worldWidth);

el('showOutline').checked = params.showOutline;
el('showOutline').addEventListener('change', (e) => { params.showOutline = e.target.checked; });

startBtn.addEventListener('click', () => {
    if (state !== SimState.IDLE) return;
    // resources are already sized correctly - the block is already seeded by the
    // IDLE preview each frame, this just kicks off the flux/height passes on it
    const { dropStartCol, dropEndCol, dropDepth } = computeDropRegion();
    resetSimulation(sim.waterPPB, sim.fluxPPB, params.columnCount, dropStartCol, dropEndCol, dropDepth);
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
    regenerateTerrainRequested = true;
});

function computeDropRegion() {
    const columnWidth = params.worldWidth / params.columnCount;

    let dropStartCol = Math.floor((params.dropPositionX - params.dropWidth / 2) / columnWidth);
    let dropEndCol = Math.ceil((params.dropPositionX + params.dropWidth / 2) / columnWidth);
    dropStartCol = Math.max(0, Math.min(params.columnCount, dropStartCol));
    dropEndCol = Math.max(dropStartCol, Math.min(params.columnCount, dropEndCol));

    // depth needed so that (uniform depth) x (actual quantized width) = requested drop area
    const dropWidthActual = (dropEndCol - dropStartCol) * columnWidth;
    const dropDepth = dropWidthActual > 0 ? params.dropAreaM2 / dropWidthActual : 0;

    return { columnWidth, dropStartCol, dropEndCol, dropWidthActual, dropDepth };
}

function updatePanel(dropInfo, substeps, subDt) {
    stateLabel.textContent = `State: ${state}`;

    startBtn.disabled = state !== SimState.IDLE;
    stopBtn.disabled = state !== SimState.RUNNING;
    deleteBtn.disabled = state !== SimState.STOPPED;

    for (const id of lockedWhileRunningIds) {
        el(id).disabled = state !== SimState.IDLE;
    }

    cflInfo.textContent = `CFL: ${substeps} substep${substeps === 1 ? '' : 's'} per frame (${subDt.toFixed(5)} s each)`;
    columnWidthInfo.textContent = `-> column width d = ${dropInfo.columnWidth.toFixed(3)} m`;
    dropDepthInfo.textContent = `-> depth per column = ${dropInfo.dropDepth.toFixed(3)} m ` +
        `(spanning ${dropInfo.dropEndCol - dropInfo.dropStartCol} columns, ${dropInfo.dropWidthActual.toFixed(1)} m)`;
}

// ---- render loop ----
function frame() {
    resizeCanvas();

    // d is derived, not set directly
    const dropInfo = computeDropRegion();
    const { columnWidth, dropStartCol, dropEndCol, dropDepth } = dropInfo;
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
        // column count only changes buffer SIZE, and regenerating terrain needs
        // a fresh texture too - both only happen while IDLE, like the old rebuild
        if (params.columnCount !== resourceColumnCount || regenerateTerrainRequested) {
            if (regenerateTerrainRequested) {
                terrainSeed++;
            }
            sim.columnRenderer.dispose();
            sim.waterPPB.dispose();
            sim.fluxPPB.dispose();
            gl.deleteTexture(sim.terrainTexture);
            sim = buildSimResources(params.columnCount, params.worldWidth, params.terrainHeightScale, terrainSeed);
            resourceColumnCount = params.columnCount;
            regenerateTerrainRequested = false;
        }
        // reseeding every IDLE frame with the live slider values doubles as the
        // "preview" - dragging position/width/volume shows the pending block directly,
        // already at the depth it would actually be dropped at
        resetSimulation(sim.waterPPB, sim.fluxPPB, params.columnCount, dropStartCol, dropEndCol, dropDepth);
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
                0, 0, 0,
            );
            sim.waterPPB.next().unbind();
            sim.waterPPB.swap();
        }
    }
    // when STOPPED: skip the two passes above, draw keeps showing the frozen state

    // draw the terrain, then the water on top of it
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.05, 0.05, 0.08, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    sim.columnRenderer.setGapFraction(params.showOutline ? 0.1 : 0.0);
    sim.columnRenderer.renderTerrain(sim.terrainTexture, params.maxHeightDisplay, ...TERRAIN_COLOR);
    sim.columnRenderer.renderWater(sim.terrainTexture, sim.waterPPB.current().getTexture(), params.maxHeightDisplay, ...WATER_COLOR);
    if (params.showOutline) {
        sim.columnRenderer.renderWaterOutline(sim.terrainTexture, sim.waterPPB.current().getTexture(), params.maxHeightDisplay, ...OUTLINE_COLOR);
    }

    updatePanel(dropInfo, substeps, subDt);

    requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
