import { MireiaMat4 } from "../math/MireiaMat4";

// A scene node groups meshes and propagates transforms through its children.
export class MireiaNode{
    #meshes;
    #children;
    #tMat;
    #preMultipliedtMat;
    #drawMode;
    #vertices;
    #texture;
    #bLighting;

    constructor(meshes=[],tMat=new MireiaMat4(),drawMode='TRIANGLES',texture=null){
        this.#meshes=meshes;
        this.#children=[];
        this.#tMat=tMat;
        this.#preMultipliedtMat=tMat.getMatrix();
        this.#drawMode=drawMode;
        this.#vertices=[];
        this.#texture=texture;
        this.#bLighting=true;
    }

    getLighting(){return this.#bLighting;}
    setLighting(bLighting){this.#bLighting=bLighting;}

    getMeshes() { return this.#meshes; }
    setMeshes(meshes) { this.#meshes = meshes; }

    getDrawMode(gl) {
        return gl[this.#drawMode];
    }

    setDrawMode(drawMode) { this.#drawMode = drawMode; }
 
    addMesh(mesh) {
        if (this.#meshes === undefined) {
            this.#meshes = [];
        }
        this.#meshes.push(mesh);
    }
 
    getChildren() { return this.#children; }
 
    addChild(child) {
        if (this.#children === undefined) {
            this.#children = [];
        }
        this.#children.push(child);
    }

    getTexture() { return this.#texture; } 
    setTexture(texture) { this.#texture = texture; }

    getLocalTransform() { return this.#tMat; }
    setLocalTransform(transform) { this.#tMat = transform; }

    getTransform(){
        const preMultipliedtMat = this.#preMultipliedtMat;
        function getMatrix(){return preMultipliedtMat;}
        return {getMatrix: getMatrix};
    }

    getVertices() {
        this.#vertices.length = 0;
        for (const mesh of this.#meshes) {
            for (const v of mesh.getVertices()) {
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
        for (var i = 0; i < this.#meshes.length; i++) {
            var mesh = this.#meshes[i];
            var currIndices = mesh.getIndices();
            resultIndices = resultIndices.concat(currIndices);
        }
        return resultIndices;
    }

    updatePreComputedMat(parenttMat=null){
        const locattMat = this.#tMat.getMatrix();
        this.#preMultipliedtMat = parenttMat
            ? MireiaMat4.multiplyArrays(parenttMat, locattMat)
            : locattMat;

        for (const child of this.#children){
            child.updatePreComputedMat(this.#preMultipliedtMat);
        }
}

    getRenderableNodes() {
        let result = [];
        if (this.#meshes.length > 0) {
            result.push(this);
        }
        for (const child of this.#children) {
            result = result.concat(child.getRenderableNodes());
        }
        return result;
    }

    addTo(main) {
        const nodes = this.getRenderableNodes()
        for (const node of nodes) {
            main.addObject(node);
        }
        main.addUpdateCallback(() => this.updatePreComputedMat());
    }
}