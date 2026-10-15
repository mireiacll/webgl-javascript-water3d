// Control panel: binds DOM inputs to the simulation's params and actions.
import { COLOR_RAMP } from './core/colorRamp.js';

const MAX_DROP_DEPTH_FRACTION = 0.05;
const DROP_VOLUME_SLIDER_STEPS = 1000;
const DROP_VOLUME_CURVE_EXPONENT = 3;

function formatClock(seconds) {
    const t = Math.floor(seconds);
    const pad = (v) => String(v).padStart(2, '0');
    return `${pad(Math.floor(t / 3600))}:${pad(Math.floor(t / 60) % 60)}:${pad(t % 60)}`;
}

export function initUI({ params, realTerrain, SimState, getState, getActiveWorldWidth, hasImagery, actions }) {
    const el = (id) => document.getElementById(id);
    const stateLabel = el('stateLabel');
    const startBtn = el('startBtn');
    const stopBtn = el('stopBtn');
    const deleteBtn = el('deleteBtn');
    const cflInfo = el('cflInfo');
    const columnWidthInfo = el('columnWidthInfo');
    const dropDepthInfo = el('dropDepthInfo');
    const regenerateTerrainBtn = el('regenerateTerrainBtn');
    const loadRealTerrainBtn = el('loadRealTerrainBtn');
    const realTerrainStatus = el('realTerrainStatus');
    const rainToggleBtn = el('rainToggleBtn');
    const rainInfo = el('rainInfo');

    const lockedWhileRunningIds = [
        'simMode',
        'columnCount', 'worldWidth', 'damping',
        'terrainHeightScale', 'regenerateTerrainBtn',
        'dropPositionX', 'dropPositionY', 'dropWidth', 'dropVolumeM3',
        'centerLat', 'centerLon', 'loadRealTerrainBtn',
    ];

    function bindSlider(id, paramKey, format = (v) => v, commitOnChange = false) {
        const input = el(id);
        const valueEl = el(`${id}Value`);
        input.value = params[paramKey];
        valueEl.textContent = format(params[paramKey]);
        input.addEventListener('input', () => {
            if (!commitOnChange) params[paramKey] = parseFloat(input.value);
            valueEl.textContent = format(params[paramKey]);
            if (commitOnChange) valueEl.textContent = format(parseFloat(input.value));
        });
        if (commitOnChange) {
            input.addEventListener('change', () => { params[paramKey] = parseFloat(input.value); });
        }
    }

    bindSlider('dt', 'dt', (v) => v.toFixed(4));
    bindSlider('columnCount', 'columnCount', (v) => Math.round(v), true);
    bindSlider('worldWidth', 'worldWidth', (v) => v.toFixed(1));
    bindSlider('damping', 'damping', (v) => v.toFixed(3));
    bindSlider('terrainHeightScale', 'terrainHeightScale', (v) => v.toFixed(1));
    bindSlider('dropPositionX', 'dropPositionX', (v) => v.toFixed(1));
    bindSlider('dropPositionY', 'dropPositionY', (v) => v.toFixed(1));
    bindSlider('dropWidth', 'dropWidth', (v) => v.toFixed(1));
    bindSlider('rainRate', 'rainMmPerHour', (v) => v.toFixed(0));

    // A cubic mapping gives the volume slider more precision near zero.
    function currentDropVolumeMax() {
        return MAX_DROP_DEPTH_FRACTION * getActiveWorldWidth() ** 3;
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

    function syncDropRanges() {
        const w = String(getActiveWorldWidth());
        el('dropPositionX').max = w;
        el('dropPositionY').max = w;
        el('dropWidth').max = w;
        refreshDropVolumeSlider();
    }
    syncDropRanges();

    // Water source: each mode has its own section.
    const simModeEl = el('simMode');
    function applyMode() {
        el('dropSection').hidden = params.mode !== 'drop';
        el('rainSection').hidden = params.mode !== 'rain';
    }
    simModeEl.value = params.mode;
    simModeEl.addEventListener('change', (e) => { params.mode = e.target.value; applyMode(); });
    applyMode();

    const rainDurationEl = el('rainDuration');
    rainDurationEl.value = params.rainDurationMin;
    rainDurationEl.addEventListener('input', (e) => { params.rainDurationMin = Math.max(0, parseFloat(e.target.value) || 0); });
    rainToggleBtn.addEventListener('click', actions.toggleRain);

    el('openBoundary').checked = params.openBoundary;
    el('openBoundary').addEventListener('change', (e) => { params.openBoundary = e.target.checked; });

    el('showOutline').checked = params.showOutline;
    el('showOutline').addEventListener('change', (e) => { params.showOutline = e.target.checked; });

    el('showMinimaps').checked = params.showMinimaps;
    el('minimaps').hidden = !params.showMinimaps;
    el('showMinimaps').addEventListener('change', (e) => {
        params.showMinimaps = e.target.checked;
        el('minimaps').hidden = !e.target.checked;
    });

    el('terrainAsMesh').checked = params.terrainAsMesh;
    el('terrainAsMesh').addEventListener('change', (e) => { params.terrainAsMesh = e.target.checked; });

    el('waterAsMesh').checked = params.waterAsMesh;
    el('waterAsMesh').addEventListener('change', (e) => { params.waterAsMesh = e.target.checked; });

    // Water coloring: what to color by, legend range, and the on-canvas legend.
    const LEGEND_INFO = {
        depth: { title: 'Water level', unit: 'm' },
        velocity: { title: 'Velocity', unit: 'm/s' },
        flux: { title: 'Flux (discharge per unit width)', unit: 'm\u00B2/s' },
    };
    const colorModeEl = el('waterColorMode');
    const rangeAutoEl = el('waterRangeAuto');
    const rangeMaxEl = el('waterRangeMax');
    const legendEl = el('waterLegend');
    const rgb = (c) => `rgb(${c.map((v) => Math.round(v * 255)).join(',')})`;
    el('legendBar').style.background = `linear-gradient(to right, ${COLOR_RAMP.map(rgb).join(', ')})`;

    // Each quantity remembers its own range setting (auto or typed-in) when you switch between them.
    const currentRange = () => params.waterRanges[params.waterColorMode];
    function syncRangeControls() {
        const r = currentRange();
        rangeAutoEl.checked = r ? r.auto : true;
        if (r && !r.auto) rangeMaxEl.value = r.max;
    }
    colorModeEl.value = params.waterColorMode;
    syncRangeControls();
    colorModeEl.addEventListener('change', (e) => {
        params.waterColorMode = e.target.value;
        syncRangeControls();
    });
    rangeAutoEl.addEventListener('change', (e) => {
        const r = currentRange();
        if (!r) return;
        r.auto = e.target.checked;
        // Unticking freezes the range at the value shown now.
        if (!r.auto) r.max = parseFloat(rangeMaxEl.value) || r.max;
    });
    rangeMaxEl.addEventListener('input', (e) => {
        const r = currentRange();
        const v = parseFloat(e.target.value);
        if (r && v > 0) r.max = v;
    });

    el('showImagery').checked = params.showImagery;
    el('showImagery').addEventListener('change', (e) => {
        params.showImagery = e.target.checked;
        actions.applyImagery();
    });

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
            realTerrainStatus.textContent = hasImagery() ? 'Terrain loaded with satellite imagery' : 'Terrain loaded';
        } else {
            realTerrainStatus.textContent = 'Not loaded yet';
        }
    }
    updateRealTerrainStatus();

    loadRealTerrainBtn.addEventListener('click', actions.loadRealTerrain);
    startBtn.addEventListener('click', actions.start);
    stopBtn.addEventListener('click', actions.stop);
    deleteBtn.addEventListener('click', actions.remove);
    regenerateTerrainBtn.addEventListener('click', actions.regenerateTerrain);

    // Refresh state and numeric readouts after each frame.
    function update(dropInfo, substeps, subDt, waterRangeMax, rainStats, minimapRanges) {
        const state = getState();
        stateLabel.textContent = `State: ${state}`;

        startBtn.disabled = state !== SimState.IDLE;
        stopBtn.disabled = state !== SimState.RUNNING;
        deleteBtn.disabled = state !== SimState.STOPPED;

        rainToggleBtn.disabled = state !== SimState.RUNNING || params.mode !== 'rain';
        rainToggleBtn.textContent = (state === SimState.RUNNING && !rainStats.active) ? 'Resume rain' : 'Stop rain';
        rainInfo.textContent = `t ${formatClock(rainStats.simTime)} -> ${rainStats.depthMm.toFixed(1)} mm of rain = ${rainStats.volume.toFixed(0)} m^3`;

        for (const id of lockedWhileRunningIds) {
            el(id).disabled = state !== SimState.IDLE;
        }
        el('terrainHeightScale').disabled = el('terrainHeightScale').disabled || params.terrainSource === 'real';

        cflInfo.textContent = `CFL: ${substeps} substep${substeps === 1 ? '' : 's'} per frame (${subDt.toFixed(5)} s each)`;
        columnWidthInfo.textContent = `-> column width d = ${dropInfo.columnWidth.toFixed(3)} m`;
        dropDepthInfo.textContent = `-> depth per column = ${dropInfo.dropDepth.toFixed(3)} m ` +
            `(spanning ${dropInfo.dropEndCol - dropInfo.dropStartCol} x ${dropInfo.dropEndRow - dropInfo.dropStartRow} columns, ` +
            `${dropInfo.dropSizeX.toFixed(1)} x ${dropInfo.dropSizeY.toFixed(1)} m)`;

        if (minimapRanges) {
            for (const [mode, range] of Object.entries(minimapRanges)) {
                el(`minimapMax_${mode}`).textContent = range.toPrecision(3);
            }
        }

        // Water legend: hidden when nothing is colored; range box mirrors the auto value.
        const info = LEGEND_INFO[params.waterColorMode];
        legendEl.hidden = !info;
        const range = params.waterRanges[params.waterColorMode];
        rangeAutoEl.disabled = !range;
        rangeMaxEl.disabled = !range || range.auto;
        if (info) {
            el('legendTitle').textContent = `${info.title} (${info.unit})`;
            el('legendMin').textContent = '0';
            el('legendMax').textContent = waterRangeMax.toPrecision(3);
            if (range.auto) rangeMaxEl.value = waterRangeMax.toPrecision(3);
        }
    }

    return { update, updateRealTerrainStatus, syncDropRanges };
}