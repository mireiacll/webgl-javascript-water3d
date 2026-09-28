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

// Keep real bathymetry; only fill values outside plausible Earth elevations.
const MIN_PLAUSIBLE_METERS = -12000;
const MAX_PLAUSIBLE_METERS = 9500;
export function fillNoDataInPlace(heightfield, gridWidth, gridHeight) {
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