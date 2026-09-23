export class MireiaVec4 {
    #x;
    #y;
    #z;
    #w;

    constructor(x = 0, y = 0, z = 0, w = 1) {
        this.#x = x;
        this.#y = y;
        this.#z = z;
        this.#w = w;
    }

    getX() { return this.#x; }
    setX(x) { this.#x = x; }

    getY() { return this.#y; }
    setY(y) { this.#y = y; }

    getZ() { return this.#z; }
    setZ(z) { this.#z = z; }

    getW() { return this.#w; }
    setW(w) { this.#w = w; }

    toArray() {
        return [this.#x, this.#y, this.#z, this.#w];
    }

    length() {
        return Math.sqrt(this.#x ** 2 + this.#y ** 2 + this.#z ** 2 + this.#w ** 2);
    }

    dot(other) {
        return this.#x * other.getX() + this.#y * other.getY() + this.#z * other.getZ() + this.#w * other.getW();
    }
}