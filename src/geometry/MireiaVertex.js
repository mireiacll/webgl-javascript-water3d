import { MireiaVec2 } from '../math/MireiaVec2.js';
import { MireiaVec3 } from '../math/MireiaVec3.js';
import { MireiaVec4 } from '../math/MireiaVec4.js';
import { MireiaColor4 } from '../math/MireiaColor4.js';

export class MireiaVertex {
    #position;
    #color;
    #texCoord;
    #normal;
    #id;
    #pickId;
    #groupId;

    constructor(position = new MireiaVec3(), color = null, texCoord = null, normal = null) {
        this.#position = position;
        this.#color = color ?? new MireiaColor4();
        this.#texCoord = texCoord ?? new MireiaVec2();
        this.#normal = normal ?? new MireiaVec3(0, 1, 0);
        this.#id = -1;
        this.#pickId = -1;
        this.#groupId = -1;
    }

    getPosition() { return this.#position; }
    setPosition(position) { this.#position = position; }

    getColor() { return this.#color; }
    setColor(color) { this.#color = color; }

    getTexCoord() { return this.#texCoord; }
    setTexCoord(texCoord) { this.#texCoord = texCoord; }

    getNormal() { return this.#normal; }
    setNormal(normal) { this.#normal = normal; }

    getId() { return this.#id; }
    setId(id) { this.#id = id; }

    getPickId() { return this.#pickId; }
    setPickId(pickId) { this.#pickId = pickId; }

    getGroupId() { return this.#groupId; }
    setGroupId(groupId) { this.#groupId = groupId; }

    // flattened data for the GPU buffer: position(3) + color(4) + uv(2) + normal(3) = 12 floats
    toArray() {
        return [
            ...this.#position.toArray(),
            ...this.#color.toArray(),
            ...this.#texCoord.toArray(),
            ...this.#normal.toArray(),
        ];
    }
}