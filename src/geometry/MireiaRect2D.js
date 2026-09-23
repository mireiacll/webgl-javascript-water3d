export class MireiaRect2D{
    #minX;
    #maxX;
    #minY;
    #maxY;

    constructor(minX, maxX, minY, maxY){
        this.#minX = minX;
        this.#maxX = maxX;
        this.#minY = minY;
        this.#maxY = maxY;
    }

    getMinX() { return this.#minX; }
    getMaxX() { return this.#maxX; }
    getMinY() { return this.#minY; }
    getMaxY() { return this.#maxY; }

    static fromPoints(p0, p1) {
        return new MireiaRect2D(
            Math.min(p0.getX(), p1.getX()),
            Math.max(p0.getX(), p1.getX()),
            Math.min(p0.getY(), p1.getY()),
            Math.max(p0.getY(), p1.getY())
        );
    }

    containsPoint(point) {
        const x = point.getX();
        const y = point.getY();
        return x >= this.#minX && x <= this.#maxX && y >= this.#minY && y <= this.#maxY;
    }

    intersects(other, eps = 1e-10) {
        const separatedOnX = this.#maxX < other.getMinX() - eps || other.getMaxX() < this.#minX - eps;
        const separatedOnY = this.#maxY < other.getMinY() - eps || other.getMaxY() < this.#minY - eps;
        return !(separatedOnX || separatedOnY);
    }

}