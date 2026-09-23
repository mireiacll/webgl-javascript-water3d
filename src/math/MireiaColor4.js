export class MireiaColor4 {
    #r;
    #g;
    #b;
    #a;

    constructor(r = 0, g = 0, b = 0, a = 1) {
        this.#r = r;
        this.#g = g;
        this.#b = b;
        this.#a = a;
    }

    getR() { return this.#r; }
    setR(r) { this.#r = r; }

    getG() { return this.#g; }
    setG(g) { this.#g = g; }

    getB() { return this.#b; }
    setB(b) { this.#b = b; }

    getA() { return this.#a; }
    setA(a) { this.#a = a; }

    toArray() {
        return [this.#r, this.#g, this.#b, this.#a];
    }

    // 0-1 floats -> 0-255 bytes, for packing into a Uint8Array vertex buffer
    toBytes() {
        const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
        return [clamp255(this.#r), clamp255(this.#g), clamp255(this.#b), clamp255(this.#a)];
    }

    length() {
        return Math.sqrt(this.#r ** 2 + this.#g ** 2 + this.#b ** 2 + this.#a ** 2);
    }

    dot(other) {
        return this.#r * other.getR() + this.#g * other.getG() + this.#b * other.getB() + this.#a * other.getA();
    }
}