// webgl/geo/MireiaGroundPlane.js
import { MireiaVec2 } from '../math/MireiaVec2.js';
import { MireiaVec3 } from '../math/MireiaVec3.js';
import { MireiaVec4 } from '../math/MireiaVec4.js';
import { MireiaVertex } from '../geometry/MireiaVertex.js';
import { MireiaPrimitive } from '../geometry/MireiaPrimitive.js';
import { MireiaMesh } from '../geometry/MireiaMesh.js';
import { MireiaNode } from '../geometry/MireiaNode.js';
import { MireiaScene } from '../geometry/MireiaScene.js';
import { MireiaMat4 } from '../math/MireiaMat4.js';
import { createFace } from '../geometry/geometryUtils.js';
import { Texture } from '../core/Texture.js';
import { MireiaTileMosaic } from './MireiaTileMosaic.js';
import { MireiaColor4 } from "../math/MireiaColor4.js";

export class MireiaGroundPlane {
    #primitive;
    #texture;
    #transform;
    #scene;

    constructor(corners, elevation, gl, canvas) {
        const { sw, se, ne, nw } = corners;
        const white = new MireiaColor4(1, 1, 1, 1);

        const v0 = new MireiaVertex(new MireiaVec3(sw.getX(), sw.getY(), elevation), white, new MireiaVec2(0, 1));
        const v1 = new MireiaVertex(new MireiaVec3(se.getX(), se.getY(), elevation), white, new MireiaVec2(1, 1));
        const v2 = new MireiaVertex(new MireiaVec3(ne.getX(), ne.getY(), elevation), white, new MireiaVec2(1, 0));
        const v3 = new MireiaVertex(new MireiaVec3(nw.getX(), nw.getY(), elevation), white, new MireiaVec2(0, 0));

        this.#primitive = new MireiaPrimitive();
        createFace(v0, v1, v2, v3, this.#primitive);
        this.#primitive.calculateVerticesNormal();

        this.#texture = new Texture(gl, canvas);

        this.#transform = new MireiaMat4();
        const mesh = new MireiaMesh([this.#primitive]);
        const node = new MireiaNode([mesh], this.#transform, 'TRIANGLES', this.#texture);
        this.#scene = new MireiaScene(node);
    }

    getTexture() { return this.#texture; }
    getScene() { return this.#scene; }
    getVertices() { return this.#primitive.getVertices(); }

    static async build(globe, dataBbox, gl, { urlTemplate, elevation = 0 } = {}) {
        const { canvas, coveredBbox } = await MireiaTileMosaic.build(dataBbox, { urlTemplate });

        const cornersLonLat = [
            new MireiaVec2(coveredBbox.getMinX(), coveredBbox.getMinY()), // SW
            new MireiaVec2(coveredBbox.getMaxX(), coveredBbox.getMinY()), // SE
            new MireiaVec2(coveredBbox.getMaxX(), coveredBbox.getMaxY()), // NE
            new MireiaVec2(coveredBbox.getMinX(), coveredBbox.getMaxY()), // NW
        ];
        const [sw, se, ne, nw] = globe.recenterRing(cornersLonLat);

        // const width = 100;
        // const [sw, se, ne, nw] = [new MireiaVec2(-width,-width),new MireiaVec2(width,-width),new MireiaVec2(width,width),new MireiaVec2(-width,width)]

        return new MireiaGroundPlane({ sw, se, ne, nw }, elevation, gl, canvas);
    }
}