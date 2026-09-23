import { MireiaVertex } from "./MireiaVertex.js";
import { MireiaColor4 } from "../math/MireiaColor4.js";
import { MireiaMat4 } from "../math/MireiaMat4.js";
import { MireiaMesh } from "./MireiaMesh.js";
import { MireiaNode } from "./MireiaNode.js";
import { MireiaScene } from "./MireiaScene.js";

export class MireiaPoints {
  #vertices;
  #indices;
  #transform;
  #scene;

  constructor(points, color = null) {
    const c = color ?? new MireiaColor4(1, 1, 1, 1);
    this.#vertices = points.map(p => new MireiaVertex(p, c));
    this.#indices = this.#vertices.map((_, i) => i); // each point stands alone

    this.#transform = new MireiaMat4();
    const mesh = new MireiaMesh([this]); 
    const node = new MireiaNode([mesh], this.#transform, 'POINTS');
    node.setLighting(false);
    this.#scene = new MireiaScene(node);
  }

  getVertices() { return this.#vertices; }
  getIndices() { return this.#indices; }
  calculateVerticesNormal() {} // points have no faces

  getTransform() { return this.#transform; }
  setTransform(t) { this.#transform = t; }
  getDrawMode(gl) { return gl.POINTS; }
  getLighting() { return false; }
  getScene() { return this.#scene; }
}