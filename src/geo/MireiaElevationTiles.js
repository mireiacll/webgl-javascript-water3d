import { MireiaTileMath } from './MireiaTileMath.js';

const TILE_SIZE = 256;
const DEFAULT_URL_TEMPLATE = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

// Fetch Terrarium tiles and decode each one straight into a row-major heightfield.
export class MireiaElevationTiles {
    static async build(bbox, { urlTemplate = DEFAULT_URL_TEMPLATE, maxTilesPerSide = 8 } = {}) {
        // Terrarium data is published through zoom 15.
        const MAX_TERRARIUM_ZOOM = 15;
        const zoom = Math.min(MireiaTileMath.chooseZoomForBbox(bbox, maxTilesPerSide), MAX_TERRARIUM_ZOOM);
        const tiles = MireiaTileMath.tilesForBbox(bbox, zoom);

        const xs = tiles.map(t => t.x);
        const ys = tiles.map(t => t.y);
        const minTileX = Math.min(...xs);
        const maxTileX = Math.max(...xs);
        const minTileY = Math.min(...ys);
        const maxTileY = Math.max(...ys);

        const cols = maxTileX - minTileX + 1;
        const rows = maxTileY - minTileY + 1;

        // Preserve both dimensions: a tile mosaic need not be square.
        const gridWidth = cols * TILE_SIZE;
        const gridHeight = rows * TILE_SIZE;
        const heightfield = new Float32Array(gridWidth * gridHeight);

        // One scratch canvas is enough: draw + read back run synchronously, so tiles can share it.
        const scratch = document.createElement('canvas');
        scratch.width = TILE_SIZE;
        scratch.height = TILE_SIZE;
        const ctx = scratch.getContext('2d', { willReadFrequently: true });

        await Promise.all(tiles.map(async ({ x, y, zoom }) => {
            const tile = await MireiaElevationTiles.#decodeWithFallback(ctx, urlTemplate, x, y, zoom);

            const dx = (x - minTileX) * TILE_SIZE;
            const dy = (y - minTileY) * TILE_SIZE;
            for (let r = 0; r < TILE_SIZE; r++) {
                heightfield.set(tile.values.subarray(r * TILE_SIZE, (r + 1) * TILE_SIZE), (dy + r) * gridWidth + dx);
            }
        }));

        const nwLonLat = MireiaTileMath.tileToLonLat(minTileX, minTileY, zoom);
        const seLonLat = MireiaTileMath.tileToLonLat(maxTileX + 1, maxTileY + 1, zoom);

        return {
            heightfield,
            gridWidth,
            gridHeight,
            zoom,
            coveredBbox: { minX: nwLonLat.lon, maxX: seLonLat.lon, minY: seLonLat.lat, maxY: nwLonLat.lat },
        };
    }

    static async #decodeWithFallback(ctx, urlTemplate, x, y, zoom) {
        const urlFor = (z, tx, ty) => urlTemplate.replace('{z}', z).replace('{x}', tx).replace('{y}', ty);
        let tile = await MireiaElevationTiles.#decodeTile(ctx, urlFor(zoom, x, y), false);
        if (tile.blank) tile = await MireiaElevationTiles.#decodeTile(ctx, urlFor(zoom, x, y), true);
        if (!tile.blank) return tile;

        for (let fallbackZoom = zoom - 1; fallbackZoom >= 1; fallbackZoom--) {
            const scale = 2 ** (zoom - fallbackZoom);
            const parentX = Math.floor(x / scale);
            const parentY = Math.floor(y / scale);
            let parent;
            try {
                parent = await MireiaElevationTiles.#decodeTile(ctx, urlFor(fallbackZoom, parentX, parentY), false);
                if (parent.blank) parent = await MireiaElevationTiles.#decodeTile(ctx, urlFor(fallbackZoom, parentX, parentY), true);
            } catch {
                continue;
            }
            if (parent.blank) continue;

            const values = MireiaElevationTiles.#resampleAncestor(parent.values, x, y, parentX, parentY, scale);
            return { ...parent, values, blank: false };
        }

        return tile;
    }

    static #resampleAncestor(values, x, y, parentX, parentY, scale) {
        const output = new Float32Array(TILE_SIZE * TILE_SIZE);
        const offsetX = (x - parentX * scale) * TILE_SIZE / scale;
        const offsetY = (y - parentY * scale) * TILE_SIZE / scale;
        for (let row = 0; row < TILE_SIZE; row++) {
            const sourceY = Math.max(0, Math.min(TILE_SIZE - 1, offsetY + (row + 0.5) / scale - 0.5));
            const y0 = Math.floor(sourceY);
            const y1 = Math.min(TILE_SIZE - 1, y0 + 1);
            const ty = sourceY - y0;
            for (let col = 0; col < TILE_SIZE; col++) {
                const sourceX = Math.max(0, Math.min(TILE_SIZE - 1, offsetX + (col + 0.5) / scale - 0.5));
                const x0 = Math.floor(sourceX);
                const x1 = Math.min(TILE_SIZE - 1, x0 + 1);
                const tx = sourceX - x0;
                const top = values[y0 * TILE_SIZE + x0] * (1 - tx) + values[y0 * TILE_SIZE + x1] * tx;
                const bottom = values[y1 * TILE_SIZE + x0] * (1 - tx) + values[y1 * TILE_SIZE + x1] * tx;
                output[row * TILE_SIZE + col] = top * (1 - ty) + bottom * ty;
            }
        }
        return output;
    }

    // Elevation is stored in the raw RGB bytes, so decode with no color-space conversion
    // and no alpha premultiplication (either would shift the decoded meters).
    static async #decodeTile(ctx, url, bypassCache) {
        const response = await fetch(url, { mode: 'cors', cache: bypassCache ? 'reload' : 'default' });
        if (!response.ok) throw new Error(`Failed to load elevation tile: ${url} (${response.status})`);
        const blob = await response.blob();
        const bitmap = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });

        ctx.clearRect(0, 0, TILE_SIZE, TILE_SIZE);
        ctx.drawImage(bitmap, 0, 0, TILE_SIZE, TILE_SIZE);
        const px = ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE).data;

        const values = new Float32Array(TILE_SIZE * TILE_SIZE);
        let noDataPixels = 0;
        for (let i = 0; i < values.length; i++) {
            const p = i * 4;
            values[i] = MireiaElevationTiles.#decodeTerrarium(px[p], px[p + 1], px[p + 2]);
            if (values[i] < -12000) noDataPixels++;
        }

        const tile = { values, blank: noDataPixels === values.length };
        bitmap.close();
        return tile;
    }

    // Terrarium elevation encoding, in meters.
    static #decodeTerrarium(r, g, b) {
        return (r * 256 + g + b / 256) - 32768;
    }
}