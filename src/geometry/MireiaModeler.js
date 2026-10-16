import { MireiaPrimitive } from "./MireiaPrimitive.js";
import { MireiaSurface } from "./MireiaSurface.js";
import { MireiaTriangle } from "./MireiaTriangle.js";
import { MireiaVertex } from "./MireiaVertex.js";
import { MireiaVec3 } from "../math/MireiaVec3.js";
import { MireiaTessellator } from "./MireiaTessellator.js";
import { createFace } from "./geometryUtils.js";
import { MireiaMat4 } from "../math/MireiaMat4.js";
import { MireiaMesh } from "./MireiaMesh.js";
import { MireiaNode } from "./MireiaNode.js";
import { MireiaScene } from "./MireiaScene.js";

export class MireiaModeler{

    #primitive;
    #transform;
    #scene;
 
    constructor(primitive) {
        this.#primitive = primitive;
        this.#transform = new MireiaMat4();

        const mesh = new MireiaMesh([this.#primitive]);
        const node = new MireiaNode([mesh], this.#transform);
        this.#scene = new MireiaScene(node);
    }
 
    getTransform() { return this.#transform; }
    setTransform(transform) { this.#transform = transform; }
 
    getDrawMode(gl) {
        return gl.TRIANGLES;
    }
 
    getVertices() {
        return this.#primitive.getVertices();
    }
 
    getIndices() {
        const vertices = this.getVertices();
        for (let i = 0; i < vertices.length; i++) {
            vertices[i].setId(i);
        }
        return this.#primitive.getIndices();
    }

    getScene() { return this.#scene; }

    static extrude(polygon,height,color=null){
        const points = polygon.getPoints();
        const primitive = new MireiaPrimitive();
        const tessellator = new MireiaTessellator(points);
        const convexPolygons = tessellator.tesselate();
        for (const convexPolygon of convexPolygons){
            this.#addSurface(convexPolygon,primitive,color,0,true);
            this.#addSurface(convexPolygon,primitive,color,height,false);
        }
        this.#addWalls(polygon.getOuterRing(),primitive,color,height);
        for (const inner of polygon.getInnerRings()) {
            this.#addWalls(inner,primitive,color,height);
        }
        primitive.calculateVerticesNormal();

        return new MireiaModeler(primitive);
    }

    static #addSurface(groupPoints,primitive,color,heightOffset,reversed){
        const surface = new MireiaSurface();
        const vertices = groupPoints.map(p => new MireiaVertex(new MireiaVec3(p.getX(), p.getY(), (p.getZ?.() ?? 0) + heightOffset), color));

        for (let i = 1; i <= vertices.length - 2; i++) {
            const v0 = vertices[0];
            const v1 = reversed ? vertices[i + 1] : vertices[i];
            const v2 = reversed ? vertices[i] : vertices[i + 1];

            // skip degenerate/near-collinear triangles (zero-area fan slices)
            const p0 = v0.getPosition();
            const p1 = v1.getPosition();
            const p2 = v2.getPosition();
            const area2 = (p1.getX() - p0.getX()) * (p2.getY() - p0.getY())
                        - (p2.getX() - p0.getX()) * (p1.getY() - p0.getY());
            if (Math.abs(area2) < 1e-9) continue;

            const triangle = new MireiaTriangle(v0, v1, v2);
            surface.addTriangle(triangle);
            surface.getVertices().push(v0, v1, v2);
        }
        primitive.addSurface(surface);
    }

    static #addWalls(points,primitive,color,height){
        const n = points.length;
 
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            const p0 = points[i];
            const p1 = points[j];
            const z0 = p0.getZ?.() ?? 0;
            const z1 = p1.getZ?.() ?? 0;
 
            const vBottom0 = new MireiaVertex(new MireiaVec3(p0.getX(), p0.getY(), z0), color);
            const vBottom1 = new MireiaVertex(new MireiaVec3(p1.getX(), p1.getY(), z1), color);
            const vTop0 = new MireiaVertex(new MireiaVec3(p0.getX(), p0.getY(), z0 + height), color);
            const vTop1 = new MireiaVertex(new MireiaVec3(p1.getX(), p1.getY(), z1 + height), color);

 
            createFace(vBottom0, vBottom1, vTop1, vTop0, primitive);
        }
    }
}