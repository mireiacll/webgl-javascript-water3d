import { MireiaVec2 } from "../math/MireiaVec2";
import proj4 from "proj4";

export class MireiaGlobe{
    #geographic;
    #offsetX;
    #offsetY;
    #utmProj;
    #originX;
    #originY;

    constructor(boundingBox) {
        this.#offsetX = (boundingBox.getMinX() + boundingBox.getMaxX()) / 2;
        this.#offsetY = (boundingBox.getMinY() + boundingBox.getMaxY()) / 2;
        this.#geographic = MireiaGlobe.#isLikelyGeographic(boundingBox);

        if (this.#geographic) {
            this.#utmProj = MireiaGlobe.#utmProjectionFor(this.#offsetX, this.#offsetY);
            const [originX, originY] = proj4('EPSG:4326', this.#utmProj, [this.#offsetX, this.#offsetY]);
            this.#originX = originX;
            this.#originY = originY;
            //console.log(`[MireiaGlobe] Detected geographic (lon/lat) coordinates — reprojecting via UTM, origin at (${originX.toFixed(1)}, ${originY.toFixed(1)})`);
        } else {
            //console.log(`[MireiaGlobe] Detected projected coordinates — recentering around (${this.#offsetX.toFixed(2)}, ${this.#offsetY.toFixed(2)})`);
        }
    }

    isGeographic() { return this.#geographic; }

    recenterRing(ring) {
        return this.#geographic
            ? this.#projectGeographicRing(ring)
            : this.#recenterProjectedRing(ring);
    }

    #projectGeographicRing(ring) {
        return ring.map((point) => {
            const [x, y] = proj4('EPSG:4326', this.#utmProj, [point.getX(), point.getY()]);
            return new MireiaVec2(x - this.#originX, y - this.#originY);
        });
    }

    #recenterProjectedRing(ring) {
        return ring.map((point) => {
            return new MireiaVec2(point.getX() - this.#offsetX, point.getY() - this.#offsetY);
        });
    }

    static #isLikelyGeographic(bbox) {
        return Math.abs(bbox.getMinX()) <= 180 && Math.abs(bbox.getMaxX()) <= 180 &&
            Math.abs(bbox.getMinY()) <= 90 && Math.abs(bbox.getMaxY()) <= 90;
    }

    static #utmProjectionFor(centerLon, centerLat) {
        const zone = Math.floor((centerLon + 180) / 6) + 1;
        const hemisphere = centerLat < 0 ? ' +south' : '';
        const projString = `+proj=utm +zone=${zone}${hemisphere} +datum=WGS84 +units=m +no_defs`;
        return new proj4.Proj(projString);
    }
}