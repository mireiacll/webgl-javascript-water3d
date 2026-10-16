import { MireiaPrimitive } from "./MireiaPrimitive.js";
import { MireiaSurface } from "./MireiaSurface.js";
import { MireiaTriangle } from "./MireiaTriangle.js";
import { MireiaVertex } from "./MireiaVertex.js";
import { MireiaMat4 } from "../math/MireiaMat4.js";
import { MireiaVec2 } from "../math/MireiaVec2.js";
import { MireiaVec3 } from "../math/MireiaVec3.js";
import { MireiaVec4 } from "../math/MireiaVec4.js";
import { MireiaSeg2D } from "./MireiaSeg2D.js";
import { MireiaTessellator } from "./MireiaTessellator.js";
import { MireiaMesh } from "./MireiaMesh.js";
import { MireiaNode } from "./MireiaNode.js";
import { MireiaScene } from "./MireiaScene.js";
import { ensureWinding, boundingBoxOf } from "./geometryUtils.js";
import { MireiaColor4 } from "../math/MireiaColor4.js";

export class MireiaPolygon {

    #points;
    #outerRing;
    #innerRings;
    #primitives;
    #transform;
    #scene;

    constructor(points, color = null, innerRings = []) {

        if (!points || points.length < 3) {
            throw new Error("Polygon needs at least 3 points");
        }

        this.#outerRing = ensureWinding(points, false);
        this.#innerRings = innerRings.map(ring => ensureWinding(ring, true));
        this.#points = this.#innerRings.length > 0
            ? MireiaPolygon.#bridgeInnerRings(this.#outerRing, this.#innerRings)
            : this.#outerRing;

        const primitive = new MireiaPrimitive();
        const cColor = color ?? new MireiaColor4(0.2, 0.5, 0.8, 1);

        const tessellator = new MireiaTessellator(this.#points);
        const convexPolygons = tessellator.tesselate();

        for (const convexPolygon of convexPolygons) {
            this.#addConvexSurface(convexPolygon, primitive, color);
        }

        this.#primitives = [];
        this.#primitives.push(primitive);

        primitive.calculateVerticesNormal();

        this.#transform = new MireiaMat4();

        const mesh = new MireiaMesh(this.#primitives);
        const node = new MireiaNode([mesh], this.#transform);
        this.#scene = new MireiaScene(node);

    }

    static #bridgeInnerRings(outerRing, innerRings) {
        const orderedInners = [...innerRings].sort((a, b) => {
            const rectA = boundingBoxOf(a);
            const rectB = boundingBoxOf(b);
            if (rectA.getMinY() !== rectB.getMinY()) return rectA.getMinY() - rectB.getMinY();
            return rectA.getMinX() - rectB.getMinX();
        });

        let merged = outerRing;
        for (const innerRing of orderedInners) {
            merged = MireiaPolygon.#bridgeRing(merged, innerRing);
        }
        return merged;
    }

    static #bridgeRing(outerPoints, innerPoints) {
        const ringIdx = MireiaPolygon.#findBottomLeftIndex(innerPoints);
        const ringPoint = innerPoints[ringIdx];

        const candidates = outerPoints
            .map((p, idx) => ({ point: p, index: idx , distance: p.squaredDistance2D(ringPoint) }))
            .sort((a, b) => a.distance - b.distance);

        for (const candidate of candidates) {
            const bridgeSeg = new MireiaSeg2D(ringPoint, candidate.point);
            if (MireiaPolygon.#bridgeIntersects(bridgeSeg, ringIdx, candidate.index, innerPoints, outerPoints)) {
                continue;
            }
            return MireiaPolygon.#spliceHole(outerPoints, innerPoints, candidate.index, ringIdx);
        }
        throw new Error("Could not find a valid bridge for the inner ring");
    }

    static #bridgeIntersects(bridgeSeg, ringIdx, outerIdx, innerPoints, outerPoints) {
        const n1 = innerPoints.length;
        for (let i = 0; i < n1; i++) {
            const nextIdx = (i + 1) % n1;
            if (i === ringIdx || nextIdx === ringIdx) continue;
            const seg = new MireiaSeg2D(innerPoints[i], innerPoints[nextIdx]);
            if (bridgeSeg.getIntersectionType(seg) !== MireiaSeg2D.IntersectionType.NONE) return true;
        }
        const n2 = outerPoints.length;
        for (let i = 0; i < n2; i++) {
            const nextIdx = (i + 1) % n2;
            if (i === outerIdx || nextIdx === outerIdx) continue;
            const seg = new MireiaSeg2D(outerPoints[i], outerPoints[nextIdx]);
            if (bridgeSeg.getIntersectionType(seg) !== MireiaSeg2D.IntersectionType.NONE) return true;
        }
        return false;
    }

    static #spliceHole(outerPoints, innerPoints, outerIdx, ringIdx) {
        const merged = [];
        for (let i = 0; i <= outerIdx; i++) {
            merged.push(outerPoints[i]);
        }
        const n1 = innerPoints.length;
        for (let i = 0; i < n1; i++) {
            const idx = (ringIdx + i) % n1;
            merged.push(innerPoints[idx]);
        }
        merged.push(innerPoints[ringIdx]);
        merged.push(outerPoints[outerIdx]);
        for (let i = outerIdx + 1; i < outerPoints.length; i++) {
            merged.push(outerPoints[i]);
        }
        return merged;
    }

    static #findBottomLeftIndex(points) {
        let bestIdx = 0;
        for (let i = 1; i < points.length; i++) {
            const p = points[i];
            const best = points[bestIdx];
            if (p.getY() < best.getY() || (p.getY() === best.getY() && p.getX() < best.getX())) {
                bestIdx = i;
            }
        }
        return bestIdx;
    }

    #addConvexSurface(points, primitive, color) {
        const surface = new MireiaSurface();
        const vertices = points.map(p => new MireiaVertex(new MireiaVec3(p.getX(), p.getY(),  p.getZ?.() ?? 0), color));

        for (let i = 1; i <= points.length - 2; i++) {
            const v0 = vertices[0];
            const v1 = vertices[i];
            const v2 = vertices[i + 1];

            // skip degenerate/near-collinear triangles
            const area2 = (v1.getPosition().getX() - v0.getPosition().getX()) * (v2.getPosition().getY() - v0.getPosition().getY())
                        - (v2.getPosition().getX() - v0.getPosition().getX()) * (v1.getPosition().getY() - v0.getPosition().getY());
            if (Math.abs(area2) < 1e-9) continue;

            const triangle = new MireiaTriangle(v0, v1, v2);
            surface.addTriangle(triangle);
            surface.getVertices().push(v0, v1, v2);
        }
        primitive.addSurface(surface);
    }


    getPoints() { return this.#points; }
    getOuterRing() { return this.#outerRing; }
    getInnerRings() { return this.#innerRings; }

    getTransform() { return this.#transform; }
    setTransform(transform) { this.#transform = transform; }

    getDrawMode(gl) {
        return gl.TRIANGLES;
    }

    getVertices() {
        var resultVertices = [];
        var primitivesCount = this.#primitives.length;
        for (var i = 0; i < primitivesCount; i++) {
            var primitive = this.#primitives[i];
            var currVertices = primitive.getVertices();
            resultVertices = resultVertices.concat(currVertices);
        }
        return resultVertices;
    }

    getIndices() {
        var resultVertices = this.getVertices();
        for (var i = 0; i < resultVertices.length; i++) {
        var vertex = resultVertices[i];
        vertex.setId(i);
        }

        var resultIndices = [];
        for (var i = 0; i < this.#primitives.length; i++) {
        var primitive = this.#primitives[i];
        var currIndices = primitive.getIndices();
        resultIndices = resultIndices.concat(currIndices);
        }
        return resultIndices;
    }

    static tryCreate(points, color = null, innerRings = []) {
        try {
            return new MireiaPolygon(points, color, innerRings);
        } catch (e) {
            console.warn(`Could not create polygon — ${e.message}`);
            return null;
        }
    }

    getScene() { return this.#scene;}
}