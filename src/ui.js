// Control panel: binds DOM inputs to the simulation's params and actions.
const MAX_DROP_DEPTH_FRACTION = 0.05;
const DROP_VOLUME_SLIDER_STEPS = 1000;
const DROP_VOLUME_CURVE_EXPONENT = 3;

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

    el('showOutline').checked = params.showOutline;
    el('showOutline').addEventListener('change', (e) => { params.showOutline = e.target.checked; });

    el('terrainAsMesh').checked = params.terrainAsMesh;
    el('terrainAsMesh').addEventListener('change', (e) => { params.terrainAsMesh = e.target.checked; });

    el('waterAsMesh').checked = params.waterAsMesh;
    el('waterAsMesh').addEventListener('change', (e) => { params.waterAsMesh = e.target.checked; });

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
    function update(dropInfo, substeps, subDt) {
        const state = getState();
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

    return { update, updateRealTerrainStatus, syncDropRanges };
}