export class MireiaMesh{
    #primitives;
    #vertices;

    constructor(primitives=[]){
        this.#primitives = primitives;
        this.#vertices = [];
    }

    getPrimitives() { return this.#primitives; }
    setPrimitives(primitives) { this.#primitives = primitives; }
 
    addPrimitive(primitive) {
        if (this.#primitives === undefined) {
            this.#primitives = [];
        }
        this.#primitives.push(primitive);
    }


    getVertices() {
        this.#vertices.length = 0;
        for (const primitive of this.#primitives) {
            for (const v of primitive.getVertices()) {
                this.#vertices.push(v);
            }
        }
        return this.#vertices;
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

    calculateVerticesNormal() {
        for (const primitive of this.#primitives) {
            primitive.calculateVerticesNormal();
        }
    }
}