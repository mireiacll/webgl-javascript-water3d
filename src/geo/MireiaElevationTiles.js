import { MireiaTileMath } from './MireiaTileMath.js';

const TILE_SIZE = 256;
// Public, free, no-API-key elevation tiles (Mapzen/AWS "Terrarium" format), same
// slippy-map x/y/z scheme MireiaTileMath already implements for imagery.
// Swap this if you use a different provider - the decode math below (encoding)
// is what has to match whichever URL you point at.
const DEFAULT_URL_TEMPLATE = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

// Mirrors MireiaTileMosaic.build() - same tile-fetching/stitching shape - but
// decodes each pixel into a real elevation in meters instead of drawing an image,
// and returns a heightfield array in the SAME row-major layout
// TerrainHeightTextureBuilder.js already uses (row * gridSize + col), so it's a
// drop-in swap for heightfieldSampler() in MireiaTerrainMesh.js.
export class MireiaElevationTiles {
    static async build(bbox, { urlTemplate = DEFAULT_URL_TEMPLATE, maxTilesPerSide = 8 } = {}) {
        // this dataset only publishes tiles up to zoom 15 - chooseZoomForBbox picks the
        // HIGHEST zoom that still fits the tile-count budget, which for a small bbox is
        // almost always its search ceiling (18, tuned for imagery tiles that do go that
        // high). Clamping down is always safe here: a lower zoom means bigger tiles, so
        // it only ever needs fewer tiles to cover the same area, never more.
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
        const mosaicSize = cols * TILE_SIZE; // square: same width as height, one pixel per elevation sample

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
        // one elevation sample per pixel, row-major (row * gridWidth + col). cols and
        // rows are NOT guaranteed equal - the bbox is centered on an arbitrary lat/lon,
        // not a tile boundary, so the tile grid intersecting it is a cols x rows
        // rectangle far more often than it's a square. Collapsing this into a single
        // square "gridSize" (as this used to do) silently misaligns every row once
        // cols != rows - every consumer needs both dimensions.
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

    // Terrarium encoding: height(m) = (R * 256 + G + B / 256) - 32768
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