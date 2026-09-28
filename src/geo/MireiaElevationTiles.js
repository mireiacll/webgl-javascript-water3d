import { MireiaTileMath } from './MireiaTileMath.js';

const TILE_SIZE = 256;
const DEFAULT_URL_TEMPLATE = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

// Fetch Terrarium tiles and decode their pixels into a row-major heightfield.
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
        const mosaicSize = cols * TILE_SIZE;

        console.log(`[MireiaElevationTiles] fetching ${tiles.length} elevation tile(s) at zoom ${zoom} (${cols}x${rows} grid)`);

        const canvas = document.createElement('canvas');
        canvas.width = mosaicSize;
        canvas.height = rows * TILE_SIZE;
        const ctx = canvas.getContext('2d');

        await Promise.all(tiles.map(async ({ x, y, zoom }) => {
            const url = urlTemplate.replace('{z}', zoom).replace('{x}', x).replace('{y}', y);
            const img = await MireiaElevationTiles.#loadImage(url);
            const dx = (x - minTileX) * TILE_SIZE;
            const dy = (y - minTileY) * TILE_SIZE;
            ctx.drawImage(img, dx, dy, TILE_SIZE, TILE_SIZE);
        }));

        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        // Preserve both dimensions: a tile mosaic need not be square.
        const gridWidth = canvas.width;
        const gridHeight = canvas.height;
        const heightfield = new Float32Array(gridWidth * gridHeight);
        for (let i = 0; i < heightfield.length; i++) {
            const px = i * 4;
            heightfield[i] = MireiaElevationTiles.#decodeTerrarium(pixels[px], pixels[px + 1], pixels[px + 2]);
        }

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

    // Terrarium elevation encoding, in meters.
    static #decodeTerrarium(r, g, b) {
        return (r * 256 + g + b / 256) - 32768;
    }

    static #loadImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(`Failed to load elevation tile: ${url}`));
            img.src = url;
        });
    }
}