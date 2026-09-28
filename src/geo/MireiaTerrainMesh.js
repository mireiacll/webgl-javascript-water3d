import { MireiaVec2 } from '../math/MireiaVec2.js';
import { MireiaVec3 } from '../math/MireiaVec3.js';
import { MireiaVertex } from '../geometry/MireiaVertex.js';
import { MireiaPrimitive } from '../geometry/MireiaPrimitive.js';
import { MireiaMesh } from '../geometry/MireiaMesh.js';
import { MireiaNode } from '../geometry/MireiaNode.js';
import { MireiaScene } from '../geometry/MireiaScene.js';
import { MireiaMat4 } from '../math/MireiaMat4.js';
import { createFace } from '../geometry/geometryUtils.js';
import { MireiaColor4 } from '../math/MireiaColor4.js';

// Builds a shared-vertex terrain mesh from a height sampler.
export class MireiaTerrainMesh {
    #primitive;
    #transform;
    #scene;

    constructor(heightSampler, worldWidth, worldHeight, resolution, color = null) {
        const cols = resolution + 1;
        const rows = resolution + 1;
        const grid = new Array(rows);

        for (let row = 0; row < rows; row++) {
            grid[row] = new Array(cols);
            const y = (row / resolution) * worldHeight;
            for (let col = 0; col < cols; col++) {
                const x = (col / resolution) * worldWidth;
                const z = heightSampler(x, y);
                const u = col / resolution;
                const v = 1 - row / resolution;
                grid[row][col] = new MireiaVertex(new MireiaVec3(x, y, z), color, new MireiaVec2(u, v));
            }
        }

        this.#primitive = new MireiaPrimitive();
        for (let row = 0; row < resolution; row++) {
            for (let col = 0; col < resolution; col++) {
                const sw = grid[row][col];
                const se = grid[row][col + 1];
                const ne = grid[row + 1][col + 1];
                const nw = grid[row + 1][col];
                createFace(sw, se, ne, nw, this.#primitive);
            }
        }

        this.#primitive.calculateVerticesNormal();
        for (const surface of this.#primitive.getSurfaces()) {
            surface.calculateSmoothNormals();
        }

        this.#transform = new MireiaMat4();
        const mesh = new MireiaMesh([this.#primitive]);
        const node = new MireiaNode([mesh], this.#transform, 'TRIANGLES');
        this.#scene = new MireiaScene(node);
    }

    getScene() { return this.#scene; }
    getVertices() { return this.#primitive.getVertices(); }
}

export function proceduralHeightSampler(worldWidth, heightScale, seed) {
    const OCTAVES = 5, PERSISTENCE = 0.5, LACUNARITY = 2.2, BASE_WAVELENGTH_FRACTION = 0.6;

    let a = Number(seed) >>> 0;
    const random = () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const amplitude = [], wavelength = [], phase = [], dirX = [], dirY = [];
    let amplitudeSum = 0, amp = 1, wavelen = worldWidth * BASE_WAVELENGTH_FRACTION;
    for (let o = 0; o < OCTAVES; o++) {
        amplitude[o] = amp;
        wavelength[o] = wavelen;
        phase[o] = random() * 2 * Math.PI;
        const angle = random() * 2 * Math.PI;
        dirX[o] = Math.cos(angle);
        dirY[o] = Math.sin(angle);
        amplitudeSum += amp;
        amp *= PERSISTENCE;
        wavelen /= LACUNARITY;
    }

    return function height(x, y) {
        let raw = 0;
        for (let o = 0; o < OCTAVES; o++) {
            const along = x * dirX[o] + y * dirY[o];
            raw += amplitude[o] * Math.sin(2 * Math.PI * along / wavelength[o] + phase[o]);
        }
        return ((raw / amplitudeSum + 1) * 0.5) * heightScale;
    };
}

// Bilinearly samples row-major data; the source grid may be rectangular.
export function heightfieldSampler(heightfield, gridWidth, gridHeight, worldWidth, worldHeight) {
    return function height(x, y) {
        const fx = (x / worldWidth) * (gridWidth - 1);
        const fy = (y / worldHeight) * (gridHeight - 1);
        const x0 = Math.max(0, Math.min(gridWidth - 2, Math.floor(fx)));
        const y0 = Math.max(0, Math.min(gridHeight - 2, Math.floor(fy)));
        const tx = Math.max(0, Math.min(1, fx - x0));
        const ty = Math.max(0, Math.min(1, fy - y0));

        const h00 = heightfield[y0 * gridWidth + x0];
        const h10 = heightfield[y0 * gridWidth + x0 + 1];
        const h01 = heightfield[(y0 + 1) * gridWidth + x0];
        const h11 = heightfield[(y0 + 1) * gridWidth + x0 + 1];

        const hx0 = h00 + (h10 - h00) * tx;
        const hx1 = h01 + (h11 - h01) * tx;
        return hx0 + (hx1 - hx0) * ty;
    };
}