import { MireiaSurface } from './MireiaSurface.js';

export class MireiaPrimitive {
  #vertices;
  #surfaces;

  constructor(surfaces = []) {
    this.#vertices = [];
    this.#surfaces = surfaces;
  }

  getSurfaces() { return this.#surfaces; }
  setSurfaces(surfaces) { this.#surfaces = surfaces; }

  addSurface(surface) {
    if(this.#surfaces === undefined){
        this.#surfaces = [];
    }
    this.#surfaces.push(surface);
  }

  getVertices() {
    this.#vertices.length = 0;
    for (const surface of this.#surfaces) {
      for (const v of surface.getVertices()) {
        this.#vertices.push(v);
      }
    }
    return this.#vertices;
  }

  getIndices(){
    var resultIndices = [];
    for(var i=0; i<this.#surfaces.length; i++){
        var currIndices = this.#surfaces[i].getIndices();
        resultIndices = resultIndices.concat(currIndices);
    }
    return resultIndices;
  }

  calculateVerticesNormal(){
    for (const surface of this.#surfaces) {
        surface.calculateVerticesNormal();
    }
  }
}