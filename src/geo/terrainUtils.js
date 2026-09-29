// Pure helpers for preparing fetched elevation and imagery.
// Converts a square meter extent to an approximate longitude/latitude box.
export function computeBboxFromCenter(centerLon, centerLat, widthMeters) {
    const METERS_PER_DEGREE_LAT = 111320;
    const dLat = (widthMeters / 2) / METERS_PER_DEGREE_LAT;
    const dLon = (widthMeters / 2) / (METERS_PER_DEGREE_LAT * Math.cos(centerLat * Math.PI / 180));
    const minX = centerLon - dLon, maxX = centerLon + dLon;
    const minY = centerLat - dLat, maxY = centerLat + dLat;
    return { getMinX: () => minX, getMaxX: () => maxX, getMinY: () => minY, getMaxY: () => maxY };
}

// Tile mosaics cover whole 256px tiles, so they extend past the requested bbox.
// Find the pixel rect of the bbox inside a mosaic whose NW corner is the tile containing the bbox's NW corner.
const TILE_SIZE = 256;
function tileFraction(lon, lat, zoom) {
    const n = Math.pow(2, zoom);
    const latRad = lat * Math.PI / 180;
    return {
        x: (lon + 180) / 360 * n,
        y: (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n,
    };
}

function bboxPixelRect(bbox, zoom, mosaicWidth, mosaicHeight) {
    const nw = tileFraction(bbox.getMinX(), bbox.getMaxY(), zoom);
    const se = tileFraction(bbox.getMaxX(), bbox.getMinY(), zoom);
    const originX = Math.floor(nw.x);
    const originY = Math.floor(nw.y);

    const x0 = Math.max(0, Math.floor((nw.x - originX) * TILE_SIZE));
    const y0 = Math.max(0, Math.floor((nw.y - originY) * TILE_SIZE));
    const x1 = Math.min(mosaicWidth, Math.ceil((se.x - originX) * TILE_SIZE));
    const y1 = Math.min(mosaicHeight, Math.ceil((se.y - originY) * TILE_SIZE));
    return { x0, y0, w: x1 - x0, h: y1 - y0 };
}

// Crop the elevation mosaic to the bbox and flip rows so row 0 = south (world +Y = north),
// matching the mesh's imagery UVs.
export function cropHeightfieldToBbox(result, bbox) {
    const { heightfield, gridWidth, gridHeight, zoom } = result;
    const { x0, y0, w, h } = bboxPixelRect(bbox, zoom, gridWidth, gridHeight);
    const out = new Float32Array(w * h);
    for (let row = 0; row < h; row++) {
        const srcRow = y0 + (h - 1 - row);
        const srcStart = srcRow * gridWidth + x0;
        out.set(heightfield.subarray(srcStart, srcStart + w), row * w);
    }
    return { heightfield: out, gridWidth: w, gridHeight: h };
}

// Crop an imagery mosaic canvas to the bbox (no flip: the UV convention already handles it).
export function cropCanvasToBbox(canvas, zoom, bbox) {
    const { x0, y0, w, h } = bboxPixelRect(bbox, zoom, canvas.width, canvas.height);
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    out.getContext('2d').drawImage(canvas, x0, y0, w, h, 0, 0, w, h);
    return out;
}

// Keep real bathymetry; only fill values outside plausible Earth elevations.
const MIN_PLAUSIBLE_METERS = -12000;
const MAX_PLAUSIBLE_METERS = 9500;
// Flag isolated spikes/voids only when most surrounding samples support a different height.
const LOCAL_OUTLIER_JUMP_METERS = 100;
const LOCAL_OUTLIER_NEIGHBOR_SPREAD = 30;
const NEAR_ZERO_VOID_MAX_METERS = 2;
const HIGH_TERRAIN_MIN_METERS = 200;
export function detectLocalVoids(heightfield, gridWidth, gridHeight) {
    const mask = new Uint8Array(heightfield.length);
    const neighbors = [];
    let count = 0;
    for (let y = 0; y < gridHeight; y++) {
        for (let x = 0; x < gridWidth; x++) {
            const i = y * gridWidth + x;
            neighbors.length = 0;
            for (let dy = -1; dy <= 1; dy++) {
                const neighborY = y + dy;
                if (neighborY < 0 || neighborY >= gridHeight) continue;
                for (let dx = -1; dx <= 1; dx++) {
                    const neighborX = x + dx;
                    if ((dx === 0 && dy === 0) || neighborX < 0 || neighborX >= gridWidth) continue;
                    neighbors.push(heightfield[neighborY * gridWidth + neighborX]);
                }
            }
            if (neighbors.length < 5) continue;

            let highNeighborCount = 0;
            for (const neighbor of neighbors) {
                if (neighbor > HIGH_TERRAIN_MIN_METERS) highNeighborCount++;
            }
            if (heightfield[i] >= 0 && heightfield[i] <= NEAR_ZERO_VOID_MAX_METERS && highNeighborCount >= 4) {
                mask[i] = 1;
                count++;
                continue;
            }

            neighbors.sort((a, b) => a - b);
            const middle = neighbors.length >> 1;
            const median = neighbors.length % 2
                ? neighbors[middle]
                : (neighbors[middle - 1] + neighbors[middle]) * 0.5;
            if (Math.abs(heightfield[i] - median) <= LOCAL_OUTLIER_JUMP_METERS) continue;

            let consensus = 0;
            for (const neighbor of neighbors) {
                if (Math.abs(neighbor - median) <= LOCAL_OUTLIER_NEIGHBOR_SPREAD) consensus++;
            }
            if (consensus >= 5) { mask[i] = 1; count++; }
        }
    }
    return { mask, count };
}

const LINE_SEAM_MIN_JUMP_METERS = 50;
const LINE_SEAM_MIN_DIRECTION_RATIO = 0.85;
const LINE_SEAM_MAX_NEIGHBOR_JUMP_METERS = 25;
function repairAxisSeams(heightfield, width, height, vertical) {
    const lineCount = vertical ? width - 1 : height - 1;
    const span = vertical ? height : width;
    const meanAbsoluteJumps = new Float64Array(lineCount);
    const meanSignedJumps = new Float64Array(lineCount);
    const directionRatios = new Float64Array(lineCount);

    for (let line = 0; line < lineCount; line++) {
        let signedSum = 0;
        let absoluteSum = 0;
        let positive = 0;
        let negative = 0;
        let samples = 0;
        for (let offset = 0; offset < span; offset++) {
            const first = vertical ? offset * width + line : line * width + offset;
            const second = first + (vertical ? 1 : width);
            const a = heightfield[first];
            const b = heightfield[second];
            if (a < MIN_PLAUSIBLE_METERS || a > MAX_PLAUSIBLE_METERS ||
                b < MIN_PLAUSIBLE_METERS || b > MAX_PLAUSIBLE_METERS) continue;
            const difference = b - a;
            signedSum += difference;
            absoluteSum += Math.abs(difference);
            if (difference > 0) positive++;
            else if (difference < 0) negative++;
            samples++;
        }
        if (samples === 0) continue;
        meanSignedJumps[line] = signedSum / samples;
        meanAbsoluteJumps[line] = absoluteSum / samples;
        directionRatios[line] = Math.max(positive, negative) / samples;
    }

    let repaired = 0;
    for (let line = 0; line < lineCount; line++) {
        const jump = meanAbsoluteJumps[line];
        if (jump < LINE_SEAM_MIN_JUMP_METERS || directionRatios[line] < LINE_SEAM_MIN_DIRECTION_RATIO) continue;
        const previousJump = line > 0 ? meanAbsoluteJumps[line - 1] : 0;
        const nextJump = line + 1 < lineCount ? meanAbsoluteJumps[line + 1] : 0;
        if (previousJump > LINE_SEAM_MAX_NEIGHBOR_JUMP_METERS || nextJump > LINE_SEAM_MAX_NEIGHBOR_JUMP_METERS) continue;

        const correction = -meanSignedJumps[line];
        const firstIndex = vertical ? line + 1 : (line + 1) * width;
        const step = vertical ? width : 1;
        const count = vertical ? height : (height - line - 1) * width;
        for (let i = 0, index = firstIndex; i < count; i++, index += step) {
            heightfield[index] += correction;
        }
        repaired++;
    }
    return repaired;
}

export function fillNoDataInPlace(heightfield, gridWidth, gridHeight) {
    const repairedSeams = repairAxisSeams(heightfield, gridWidth, gridHeight, true) +
        repairAxisSeams(heightfield, gridWidth, gridHeight, false);
    const { mask: localVoidMask } = detectLocalVoids(heightfield, gridWidth, gridHeight);
    const isNoData = (v, i) => v < MIN_PLAUSIBLE_METERS || v > MAX_PLAUSIBLE_METERS || localVoidMask[i] === 1;
    const total = heightfield.length;
    const state = new Uint8Array(total); // 0 = known, 1 = unfilled, 2 = queued for this layer
    const queue = new Int32Array(total);
    let queueEnd = 0;
    let validCount = 0;

    for (let i = 0; i < total; i++) {
        if (isNoData(heightfield[i], i)) state[i] = 1;
        else validCount++;
    }
    if (validCount === total) return repairedSeams > 0;
    if (validCount === 0) {
        throw new Error('fetched elevation is entirely no-data - try a different location or a smaller width');
    }

    const pendingValues = new Float32Array(total);
    const averageKnownNeighbors = (idx) => {
        const x = idx % gridWidth;
        const y = (idx / gridWidth) | 0;
        let sum = 0;
        let count = 0;
        if (x > 0 && state[idx - 1] === 0) { sum += heightfield[idx - 1]; count++; }
        if (x < gridWidth - 1 && state[idx + 1] === 0) { sum += heightfield[idx + 1]; count++; }
        if (y > 0 && state[idx - gridWidth] === 0) { sum += heightfield[idx - gridWidth]; count++; }
        if (y < gridHeight - 1 && state[idx + gridWidth] === 0) { sum += heightfield[idx + gridWidth]; count++; }
        return count ? sum / count : NaN;
    };

    // Seed the first inward layer from valid terrain, averaging rather than copying one source.
    for (let i = 0; i < total; i++) {
        if (state[i] !== 1) continue;
        const value = averageKnownNeighbors(i);
        if (Number.isFinite(value)) {
            state[i] = 2;
            pendingValues[i] = value;
            queue[queueEnd++] = i;
        }
    }

    let layerStart = 0;
    while (layerStart < queueEnd) {
        const layerEnd = queueEnd;
        for (let head = layerStart; head < layerEnd; head++) {
            const idx = queue[head];
            heightfield[idx] = pendingValues[idx];
            state[idx] = 0;
        }

        for (let head = layerStart; head < layerEnd; head++) {
            const idx = queue[head];
            const x = idx % gridWidth;
            const y = (idx / gridWidth) | 0;
            const candidates = [];
            if (x > 0 && state[idx - 1] === 1) candidates.push(idx - 1);
            if (x < gridWidth - 1 && state[idx + 1] === 1) candidates.push(idx + 1);
            if (y > 0 && state[idx - gridWidth] === 1) candidates.push(idx - gridWidth);
            if (y < gridHeight - 1 && state[idx + gridWidth] === 1) candidates.push(idx + gridWidth);
            for (const candidate of candidates) {
                const value = averageKnownNeighbors(candidate);
                if (!Number.isFinite(value)) continue;
                state[candidate] = 2;
                pendingValues[candidate] = value;
                queue[queueEnd++] = candidate;
            }
        }
        layerStart = layerEnd;
    }
    return true;
}

export function clampSeaLevelInPlace(heightfield) {
    let clamped = false;
    for (let i = 0; i < heightfield.length; i++) {
        if (heightfield[i] < 0) {
            heightfield[i] = 0;
            clamped = true;
        }
    }
    return clamped;
}

export function createImageTexture(gl, canvas) {
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