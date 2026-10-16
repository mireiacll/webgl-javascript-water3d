import { MireiaLine2D } from "./MireiaLine2D.js";
import { MireiaVec2 } from "../math/MireiaVec2.js";
import { MireiaRect2D } from "./MireiaRect2D.js";

export class MireiaSeg2D {

    #p0;
    #p1;
    #line;
    #bounds;


    static IntersectionType = {
        NONE: 'none',
        CROSSING: 'crossing',
        TOUCHING: 'touching',
        VERTEX: 'vertex',
    };

    constructor(p0, p1 ) {
        this.#p0=p0;
        this.#p1=p1;
    }

    getLine2D(){
        if (this.#line === undefined){
            this.#line = new MireiaLine2D(this.#p0,this.#p1);
        }
        return this.#line;
    }

    getBounds() {
        if (this.#bounds === undefined) {
            this.#bounds = MireiaRect2D.fromPoints(this.#p0, this.#p1);
        }
        return this.#bounds;
    }

    getP0() { return this.#p0; }
    getP1() { return this.#p1; }
    getLine() { return this.#line; }

    #withinBounds(p){
        const d0 = p.distance2D(this.#p0);
        const d1 = p.distance2D(this.#p1);
        const segLength = this.#p0.distance2D(this.#p1);
        const eps = 1e-9;
        return (d0 + d1) - segLength < eps;
    }

    #isAtVertex(p){
        const eps = 1e-9;
        return p.distance2D(this.#p0) < eps || p.distance2D(this.#p1) < eps;
    }

    getIntersectionType(seg2){
        if (!this.getBounds().intersects(seg2.getBounds())) {
            return MireiaSeg2D.IntersectionType.NONE;
        }

        const intersectPoint = this.getLine2D().getIntersectionPoint(seg2.getLine2D());
        if (intersectPoint===null){
            return MireiaSeg2D.IntersectionType.NONE;
        }

        const inBounds1 = this.#withinBounds(intersectPoint);
        const inBounds2 = seg2.#withinBounds(intersectPoint);

        if (!inBounds1 || !inBounds2) {
            return MireiaSeg2D.IntersectionType.NONE;
        }

        const isVertex1 = this.#isAtVertex(intersectPoint);
        const isVertex2 = seg2.#isAtVertex(intersectPoint);

        if (isVertex1 && isVertex2) return MireiaSeg2D.IntersectionType.VERTEX;
        if (!isVertex1 && !isVertex2) return MireiaSeg2D.IntersectionType.CROSSING;
        return MireiaSeg2D.IntersectionType.TOUCHING;
    }

    // only true or false
    intersects(seg2) {
        return this.getIntersectionType(seg2) !== MireiaSeg2D.IntersectionType.NONE;
    }

}