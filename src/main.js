import { ColumnRenderer } from './core/ColumnRenderer.js';
import { FluxPingPongBuffer } from './core/FluxPingPongBuffer.js';
import { FluxUpdateRenderer } from './core/FluxUpdateRenderer.js';
import { HeightUpdateRenderer } from './core/HeightUpdateRenderer.js';
import { ScreenRenderer } from './core/ScreenRenderer.js';
import { WaterPingPongBuffer } from './core/WaterPingPongBuffer.js';
import { buildTerrainHeightTexture } from './core/TerrainHeightTextureBuilder.js';
import { buildWaterHeightTexture } from './core/WaterHeightTextureBuilder.js';
import { Camera } from './camera/Camera.js';
import { CameraController } from './camera/CameraController.js';

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
gl.depthFunc(gl.LEQUAL);

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
    terrainHeightScale: DEFAULT_TERRAIN_HEIGHT_SCALE,
    dropPositionX: DEFAULT_WORLD_WIDTH / 2,  // meters, where the water block is centered
    dropPositionY: DEFAULT_WORLD_WIDTH / 2,
    dropWidth: DEFAULT_DROP_WIDTH,           // meters, side of the square block
    dropVolumeM3: DEFAULT_DROP_VOLUME_M3,    // total water in the block - depth is derived from this + the block's footprint
    showOutline: true,
};

let terrainSeed = DEFAULT_TERRAIN_SEED;
let regenerateTerrainRequested = false;

// ---- camera ----
const camera = new Camera();
camera.lookAt(
    [params.worldWidth / 2, params.worldWidth / 2, params.terrainHeightScale * 0.5],
    params.worldWidth * 1.1, 0, -0.7,
);
const cameraController = new CameraController(canvas, camera);

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
// the dropped block (columns [dropStartCol, dropEndCol) x rows [dropStartRow, dropEndRow)),
// which starts uniformly at dropDepth - flux starts at zero since there's no
// meaningful "last frame" yet
function resetSimulation(waterPPB, fluxPPB, columnCount, dropStartCol, dropEndCol, dropStartRow, dropEndRow, dropDepth) {
    const seedTexture = buildWaterHeightTexture(gl, columnCount, dropStartCol, dropEndCol, dropStartRow, dropEndRow, dropDepth);
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
    'dropPositionX', 'dropPositionY', 'dropWidth', 'dropVolumeM3',
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
el('dropPositionX').max = String(params.worldWidth);
el('dropPositionY').max = String(params.worldWidth);
el('dropWidth').max = String(params.worldWidth);

el('showOutline').checked = params.showOutline;
el('showOutline').addEventListener('change', (e) => { params.showOutline = e.target.checked; });

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
    regenerateTerrainRequested = true;
});

// the drop is a square block of columns centered on (dropPositionX, dropPositionY).
// its edges snap outward to whole columns, so the real footprint can be a bit bigger than
// dropWidth x dropWidth (and gets cut off where it hangs over the tank edge)
function computeDropRegion() {
    const columnWidth = params.worldWidth / params.columnCount;
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
    cameraController.groundZ = params.terrainHeightScale * 0.5;

    // draw the terrain, then the water on top of it
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.05, 0.05, 0.08, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    sim.columnRenderer.setCamera(camera.getViewProjMatrix(canvas.width / canvas.height));
    sim.columnRenderer.setGapFraction(params.showOutline ? 0.1 : 0.0);
    const waterTexture = sim.waterPPB.current().getTexture();
    sim.columnRenderer.renderTerrain(sim.terrainTexture, params.worldWidth, ...TERRAIN_COLOR);
    sim.columnRenderer.renderWater(sim.terrainTexture, waterTexture, params.worldWidth, ...WATER_COLOR);
    if (params.showOutline) {
        sim.columnRenderer.renderWaterOutline(sim.terrainTexture, waterTexture, params.worldWidth, ...OUTLINE_COLOR);
    }

    updatePanel(dropInfo, substeps, subDt);

    requestAnimationFrame(frame);
}

requestAnimationFrame(frame);