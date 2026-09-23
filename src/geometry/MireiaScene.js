import { MireiaNode } from './MireiaNode.js';

export class MireiaScene{
    #rootNode;

    constructor(node=new MireiaNode()){
        this.#rootNode=node;
    }

    getRoot() { return this.#rootNode; }
    setRoot(node) { this.#rootNode = node; }

    addChild(node) {
        this.#rootNode.addChild(node);
    }

    getRenderableNodes() {
        return this.#rootNode.getRenderableNodes();
    }

    updatePreComputedMat() {
        this.#rootNode.updatePreComputedMat();
    }
}