import { MireiaTileMath } from "./MireiaTileMath";
import { MireiaRect2D } from "../geometry/MireiaRect2D";

const TILE_SIZE=256;

export class MireiaTileMosaic{
    static async build(bbox, {urlTemplate,maxTilesPerSide=8}={}){
        if(!urlTemplate){
            throw new Error('MireiaTileMosaic.build: urlTemplate is required')
        }

        const zoom = MireiaTileMath.chooseZoomForBbox(bbox, maxTilesPerSide);
        const tiles = MireiaTileMath.tilesForBbox(bbox, zoom);

        const xs = tiles.map(t => t.x);
        const ys = tiles.map(t => t.y);
        const minTileX = Math.min(...xs);
        const maxTileX = Math.max(...xs);
        const minTileY = Math.min(...ys);
        const maxTileY = Math.max(...ys);

        const cols = maxTileX - minTileX + 1;
        const rows = maxTileY - minTileY + 1;

        const canvas = document.createElement('canvas');
        canvas.width = cols * TILE_SIZE;
        canvas.height = rows * TILE_SIZE;
        const ctx = canvas.getContext('2d');

        console.log(`[MireiaTileMosaic] fetching ${tiles.length} tile(s) at zoom ${zoom} (${cols}x${rows} grid)`);

        await Promise.all(tiles.map(async ({ x, y, zoom }) => {
            const url = urlTemplate
                .replace('{z}', zoom)
                .replace('{x}', x)
                .replace('{y}', y);

            const img = await MireiaTileMosaic.#loadImage(url);
            const dx = (x - minTileX) * TILE_SIZE;
            const dy = (y - minTileY) * TILE_SIZE;
            ctx.drawImage(img, dx, dy, TILE_SIZE, TILE_SIZE);
        }));

        const nwLonLat = MireiaTileMath.tileToLonLat(minTileX, minTileY, zoom);
        const seLonLat = MireiaTileMath.tileToLonLat(maxTileX + 1, maxTileY + 1, zoom);

        return {
            canvas,
            zoom,
            coveredBbox: new MireiaRect2D(nwLonLat.lon, seLonLat.lon, seLonLat.lat, nwLonLat.lat),
        };
    }

    static #loadImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous'; // required to use the image as a WebGL texture
            img.onload = () => resolve(img);
            img.onerror = (e) => reject(new Error(`Failed to load tile: ${url}`));
            img.src = url;
        });
    }
}