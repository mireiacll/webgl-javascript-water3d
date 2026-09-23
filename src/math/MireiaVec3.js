export class MireiaVec3 {
    #x;
    #y;
    #z;

    constructor(x = 0, y = 0, z = 0) {
        this.#x = x;
        this.#y = y;
        this.#z = z;
    }

    getX() { return this.#x; }
    setX(x) { this.#x = x; }

    getY() { return this.#y; }
    setY(y) { this.#y = y; }

    getZ() { return this.#z; }
    setZ(z) { this.#z = z; }

    toArray() {
        return [this.#x, this.#y, this.#z];
    }

    length() {
        return Math.sqrt(this.#x ** 2 + this.#y ** 2 + this.#z ** 2);
    }

    dot(other) {
        return this.#x * other.getX() + this.#y * other.getY() + this.#z * other.getZ();
    }

    distance2D(other) {
        const dx = this.#x - other.getX();
        const dy = this.#y - other.getY();
        return Math.sqrt(dx * dx + dy * dy);
    }

    squaredDistance2D(other) {
        const dx = this.#x - other.getX();
        const dy = this.#y - other.getY();
        return dx * dx + dy * dy;
    }

    // Returns a new unit-length vector pointing the same direction as this one.
    // Falls back to (0,0,-1) if this vector has zero length (can't normalize a zero vector).
    normalize() {
        const len = this.length();
        if (len === 0) return new MireiaVec3(0, 0, -1);
        return new MireiaVec3(this.#x / len, this.#y / len, this.#z / len);
    }

    // Returns a new vector perpendicular to both this vector and `other`.
    cross(other) {
        return new MireiaVec3(
            this.#y * other.getZ() - this.#z * other.getY(),
            this.#z * other.getX() - this.#x * other.getZ(),
            this.#x * other.getY() - this.#y * other.getX()
        );
    }

    add(other) {
        return new MireiaVec3(this.#x + other.getX(), this.#y + other.getY(), this.#z + other.getZ());
    }

    subtract(other) {
        return new MireiaVec3(this.#x - other.getX(), this.#y - other.getY(), this.#z - other.getZ());
    }

    scale(s) {
        return new MireiaVec3(this.#x * s, this.#y * s, this.#z * s);
    }
}