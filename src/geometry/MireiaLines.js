import { MireiaVertex } from "./MireiaVertex.js";
import { MireiaColor4 } from "../math/MireiaColor4.js";
import { MireiaMat4 } from "../math/MireiaMat4.js";
import { MireiaMesh } from "./MireiaMesh.js";
import { MireiaNode } from "./MireiaNode.js";
import { MireiaScene } from "./MireiaScene.js";

export class MireiaLines {
  #vertices;
  #indices;
  #transform;
  #scene;

  constructor(points, color = null) {
    if (points.length % 2 !== 0) {
      throw new Error("MireiaLines needs an even number of points (pairs form segments)");
    }
    const c = color ?? new MireiaColor4(1, 1, 1, 1);
    this.#vertices = points.map(p => new MireiaVertex(p, c));
    this.#indices = this.#vertices.map((_, i) => i); 

    this.#transform = new MireiaMat4();
    const mesh = new MireiaMesh([this]);
    const node = new MireiaNode([mesh], this.#transform, 'LINES'); // GL_LINES reads these in pairs: 0-1, 2-3, ...
    this.#scene = new MireiaScene(node);
  }

  getVertices() { return this.#vertices; }
  getIndices() { return this.#indices; }
  calculateVerticesNormal() {}

  getTransform() { return this.#transform; }
  setTransform(t) { this.#transform = t; }
  getDrawMode(gl) { return gl.LINES; }
  getLighting() { return false; }
  getScene() { return this.#scene; }
}