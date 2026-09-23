import { MireiaSurface } from "./MireiaSurface.js";
import { MireiaTriangle } from "./MireiaTriangle.js";
import { MireiaVertex } from "./MireiaVertex.js";
import { MireiaMat4 } from "../math/MireiaMat4.js";
import { MireiaVec3 } from "../math/MireiaVec3.js";
import { MireiaVec4 } from "../math/MireiaVec4.js";
import { MireiaVec2 } from "../math/MireiaVec2.js";

export class MireiaLine2D {
    // ax+bx+c  -> line equation
    #a;
    #b;
    #c;

    constructor(p0,p1) {
    
        const dx=p1.getX()-p0.getX();
        const dy = p1.getY()-p0.getY();

        this.#a=dy;
        this.#b=-dx;
        this.#c=-(this.#a*p0.getX()+ this.#b*p0.getY());

    }

    getA() { return this.#a; }
    getB() { return this.#b; }
    getC() { return this.#c; }

    getIntersectionPoint(other) {
        const a1 = this.#a;
        const b1 = this.#b;
        const c1 = this.#c;
        const a2 = other.getA();
        const b2 = other.getB();
        const c2 = other.getC();

        const det = a1 * b2 - a2 * b1;
        if (Math.abs(det) < 1e-10) {
            return null; // parallel 
        }

        const x = (b1 * c2 - b2 * c1) / det;
        const y = (a2 * c1 - a1 * c2) / det;

        return new MireiaVec2(x, y);
    }
    
}