export class MireiaVec2 {
    #x;
    #y;

    constructor(x = 0, y = 0) {
        this.#x = x;
        this.#y = y;
    }

    getX() { return this.#x; }
    setX(x) { this.#x = x; }

    getY() { return this.#y; }
    setY(y) { this.#y = y; }

    toArray() {
        return [this.#x, this.#y];
    }

    length() {
        return Math.sqrt(this.#x ** 2 + this.#y ** 2);
    }

    dot(other) {
        return this.#x * other.getX() + this.#y * other.getY();
    }

    cross(other) {
        return this.#x * other.getY() - this.#y * other.getX();
    }

    distance2D(other) {
        const dx = this.#x - other.getX();
        const dy = this.#y - other.getY();
        return Math.sqrt(dx * dx + dy * dy);
    }

    squaredDistance2D(other) {
        const dx = this.#x - other.getX();
        const dy = this.#y - other.getY();
        return (dx * dx + dy * dy);
    }
}