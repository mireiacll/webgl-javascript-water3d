const MINIMAP_CLEAR_COLOR = [0.05, 0.05, 0.08];
const AUTO_RANGE_FRACTION = 0.5;
const AUTO_RANGE_PERCENTILE = 0.95;
const AUTO_RANGE_FALL_RATE = 0.2;
const AUTO_RANGE_WET_DEPTH = 1e-3;

const MINIMAPS = [
    { elId: 'minimapDepth', mode: 'depth' },
    { elId: 'minimapVelocity', mode: 'velocity' },
    { elId: 'minimapFlux', mode: 'flux' },
].map((p) => ({ ...p, el: document.getElementById(p.elId) }));

function percentileOf(sorted, p) {
    return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))] : 0;
}

function topDownMatrix(worldWidth, zLo, zHi) {
    const range = zHi - zLo;
    return new Float32Array([
        2 / worldWidth, 0, 0, 0,
        0, 2 / worldWidth, 0, 0,
        0, 0, 2 / range, 0,
        -1, -1, -(1 + 2 * zLo / range), 1,
    ]);
}

// Owns top-down rendering and the measured color ranges used by minimaps and the main view.
export class MinimapRenderer {
    constructor(gl, canvas, {
        params,
        terrainMeshRenderer,
        waterMeshRenderer,
        waterColorModes,
        terrainColor,
        waterColor,
        getWorldWidth,
        getTerrainTexture,
        getColumnCount,
        gravity,
    }) {
        this.gl = gl;
        this.canvas = canvas;
        this.params = params;
        this.terrainMeshRenderer = terrainMeshRenderer;
        this.waterMeshRenderer = waterMeshRenderer;
        this.waterColorModes = waterColorModes;
        this.terrainColor = terrainColor;
        this.waterColor = waterColor;
        this.getWorldWidth = getWorldWidth;
        this.getTerrainTexture = getTerrainTexture;
        this.getColumnCount = getColumnCount;
        this.gravity = gravity;
        this.measuredRange = { depth: 0, velocity: 0, flux: 0 };
    }

    resetMeasuredRange() {
        this.measuredRange.depth = this.measuredRange.velocity = this.measuredRange.flux = 0;
    }

    updateMeasuredRange(columnWidth, columnCount, waterBuffer, fluxBuffer) {
        const n = columnCount;
        const water = waterBuffer._readPixels();
        const flux = fluxBuffer.readPixels();
        const depths = new Float32Array(n * n);
        const velocities = new Float32Array(n * n);
        const fluxes = new Float32Array(n * n);
        let wet = 0;

        for (let row = 0; row < n; row++) {
            for (let col = 0; col < n; col++) {
                const i = row * n + col;
                const h = water[i * 4];
                if (h <= AUTO_RANGE_WET_DEPTH) continue;

                const fromLeft  = col > 0     ? flux[(i - 1) * 4]     : 0;
                const fromRight = col < n - 1 ? flux[(i + 1) * 4 + 1] : 0;
                const fromDown  = row > 0     ? flux[(i - n) * 4 + 2] : 0;
                const fromUp    = row < n - 1 ? flux[(i + n) * 4 + 3] : 0;
                const qx = 0.5 * (fromLeft - flux[i * 4 + 1] + flux[i * 4]     - fromRight) / columnWidth;
                const qy = 0.5 * (fromDown - flux[i * 4 + 3] + flux[i * 4 + 2] - fromUp)    / columnWidth;
                const q = Math.hypot(qx, qy);

                depths[wet] = h;
                fluxes[wet] = q;
                velocities[wet] = Math.min(q / h, Math.sqrt(this.gravity * h));
                wet++;
            }
        }

        const targets = {
            depth: percentileOf(depths.subarray(0, wet).sort(), AUTO_RANGE_PERCENTILE),
            velocity: percentileOf(velocities.subarray(0, wet).sort(), AUTO_RANGE_PERCENTILE),
            flux: percentileOf(fluxes.subarray(0, wet).sort(), AUTO_RANGE_PERCENTILE),
        };
        for (const mode of Object.keys(targets)) {
            const target = targets[mode];
            if (!(target > 0)) continue;
            const current = this.measuredRange[mode];
            this.measuredRange[mode] = (current <= 0 || target > current)
                ? target
                : current + (target - current) * AUTO_RANGE_FALL_RATE;
        }
    }

    autoWaterRange(mode, refDepth) {
        if (this.measuredRange[mode] > 0) return this.measuredRange[mode];
        if (refDepth <= 0) return 1;
        const critical = Math.sqrt(this.gravity * refDepth);
        if (mode === 'depth') return refDepth;
        if (mode === 'velocity') return AUTO_RANGE_FRACTION * critical;
        if (mode === 'flux') return AUTO_RANGE_FRACTION * critical * refDepth;
        return 1;
    }

    rangeFor(mode, refDepth) {
        const range = this.params.waterRanges[mode];
        if (!range) return 1;
        return range.auto ? Math.max(1e-6, this.autoWaterRange(mode, refDepth)) : range.max;
    }

    render(waterTexture, fluxTexture, sceneTop, refDepth) {
        const { gl, canvas } = this;
        const canvasRect = canvas.getBoundingClientRect();
        const scale = canvas.width / canvasRect.width;
        const worldWidth = this.getWorldWidth();
        const viewProj = topDownMatrix(worldWidth, -1, sceneTop);
        const ranges = {};

        this.waterMeshRenderer.setFluxTexture(fluxTexture);
        gl.enable(gl.SCISSOR_TEST);
        for (const { el, mode } of MINIMAPS) {
            const range = this.rangeFor(mode, refDepth);
            ranges[mode] = range;

            const rect = el.getBoundingClientRect();
            const width = Math.round(rect.width * scale);
            const height = Math.round(rect.height * scale);
            if (width < 2 || height < 2) continue;
            const x = Math.round((rect.left - canvasRect.left) * scale);
            const y = Math.round(canvas.height - (rect.bottom - canvasRect.top) * scale);

            gl.viewport(x, y, width, height);
            gl.scissor(x, y, width, height);
            gl.clearColor(...MINIMAP_CLEAR_COLOR, 1.0);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

            this.terrainMeshRenderer.render(viewProj, ...this.terrainColor);
            this.waterMeshRenderer.setWaterColoring(this.waterColorModes[mode], range);
            this.waterMeshRenderer.render(
                viewProj, this.getTerrainTexture(), waterTexture,
                this.getColumnCount(), worldWidth, ...this.waterColor,
            );
        }
        gl.disable(gl.SCISSOR_TEST);
        gl.viewport(0, 0, canvas.width, canvas.height);
        return ranges;
    }
}