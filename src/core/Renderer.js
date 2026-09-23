import { Shader } from './Shader.js';
import { MireiaVec3 } from '../math/MireiaVec3.js';
import { nextPickId } from '../geometry/geometryUtils.js'; // adjust path to wherever geometryUtils.js actually lives relative to core/

const LIGHT_DIRECTION = new MireiaVec3(-0.5, 0.3, -1);
const AMBIENT_STRENGTH = 0.25;

export class Renderer {
  #gl;
  #shader;
  #bufferCache;
  #lightDirection;
  #near;
  #far;
  #selectionMap;   // encoded pick-color bytes -> selectable target (node or merged sub-object)
  #objectToPickId; // selectable target -> its pick id (so setSelected() can drive the highlight)
  #selectedObject;

  constructor(gl, near = 0.1, far = 100) {
    this.#gl = gl;
    this.#shader = new Shader(gl);
    this.#bufferCache = new WeakMap();
    this.#lightDirection = LIGHT_DIRECTION.normalize().toArray();
    this.#near = near;
    this.#far = far;
    this.#selectionMap = new Map();
    this.#objectToPickId = new Map();
    this.#selectedObject = null;
  }

  getGl() { return this.#gl; }
  getShader() { return this.#shader; }

  setSelected(object) { this.#selectedObject = object ?? null; }
  getSelected() { return this.#selectedObject; }

  pickObjectAt(bytes) {
    return this.#selectionMap.get(bytes.join(',')) ?? null;
  }

  #encodeSelectionId(id) {
    const hashed = (id * 2654435761) >>> 0; // Knuth's multiplicative hash
    const rByte = hashed & 0xff;
    const gByte = (hashed >> 8) & 0xff;
    const bByte = (hashed >> 16) & 0xff;
    return {
      bytes: [rByte, gByte, bByte],
      color: [rByte / 255, gByte / 255, bByte / 255, 1.0],
    };
  }

  render(scene, matrix, near, far, MVmat) {
    // keep renderer's internal near/far in sync with the camera for correct depth encoding
    this.#near = near;
    this.#far = far;
    const nodes = scene.getRenderableNodes();
    for (const node of nodes) {
      this.#renderNode(node, matrix, MVmat);
    }
  }

  #renderNode(object, matrix, MVmat) {
    const gl = this.#gl;
    const vertices = object.getVertices();
    const drawMode = object.getDrawMode(gl);
    const texture = typeof object.getTexture === 'function' ? object.getTexture() : null;
    const hasTexture = !!texture;

    let entry = this.#bufferCache.get(object);
    const needsRebuild = !entry || entry.verticesRef !== vertices || entry.drawMode !== drawMode || entry.hasTexture !== hasTexture;

    const isPrimitiveLineOrPoint = drawMode === gl.POINTS || drawMode === gl.LINES || drawMode === gl.LINE_STRIP || drawMode === gl.LINE_LOOP;
    if (isPrimitiveLineOrPoint) {
      gl.disable(gl.CULL_FACE);
      if (drawMode !== gl.POINTS) {
        gl.lineWidth(2);
      }
    } else {
      gl.enable(gl.CULL_FACE);
    }

    gl.disable(gl.BLEND);

    if (needsRebuild) {
      if (entry) {
        gl.deleteBuffer(entry.positionVBO);
        gl.deleteBuffer(entry.colorVBO);
        gl.deleteBuffer(entry.texCoordVBO);
        gl.deleteBuffer(entry.normalVBO);
        gl.deleteBuffer(entry.pickColorVBO);
        gl.deleteBuffer(entry.pickIdVBO);
        gl.deleteBuffer(entry.groupColorVBO);
        gl.deleteBuffer(entry.indexBuffer);
        gl.deleteVertexArray(entry.vao);
      }
      entry = this.#createBuffers(object, vertices, drawMode, hasTexture);
      this.#bufferCache.set(object, entry);
    }

    gl.useProgram(this.#shader.getProgram());

    // one call replaces all enableVertexAttribArray/vertexAttribPointer calls —
    // the GPU already remembers that setup from when the VAO was recorded
    gl.bindVertexArray(entry.vao);

    gl.uniformMatrix4fv(this.#shader.getModelViewMatrixLoc(), false, MVmat);
    gl.uniformMatrix4fv(this.#shader.getMatrixLoc(), false, matrix);
    gl.uniform3fv(this.#shader.getLightDirectionLoc(), this.#lightDirection);
    gl.uniform1f(this.#shader.getAmbientStrengthLoc(), AMBIENT_STRENGTH);

    gl.uniform1f(this.#shader.getNearLoc(), this.#near);
    gl.uniform1f(this.#shader.getFarLoc(), this.#far);

    // selection highlight is resolved per-vertex in the shader (v_pickId vs this uniform)
    const selectedPickId = this.#selectedObject
      ? (this.#objectToPickId.get(this.#selectedObject) ?? -1)
      : -1;
    gl.uniform1f(this.#shader.getSelectedPickIdLoc(), selectedPickId);

    const transform = object.getTransform();
    gl.uniformMatrix4fv(this.#shader.getObjectTMatrixLoc(), false, transform.getMatrix());

    gl.activeTexture(gl.TEXTURE0); // select texture unit 0 as the one we're about to configure
    if (texture) {
      gl.bindTexture(gl.TEXTURE_2D, texture.getTexture()); // bind this object's texture to unit 0
      gl.uniform1i(this.#shader.getTextureLoc(), 0);
      gl.uniform1f(this.#shader.getUseTextureLoc(), 1.0);
    } else {
      gl.bindTexture(gl.TEXTURE_2D, null); // clear any stale binding
      gl.uniform1f(this.#shader.getUseTextureLoc(), 0.0);
    }

    const useLighting = typeof object.getLighting === 'function' ? object.getLighting() : true;
    gl.uniform1f(this.#shader.getUseLightingLoc(), useLighting ? 1.0 : 0.0);

    gl.drawElements(drawMode, entry.indexCount, gl.UNSIGNED_INT, 0);

    gl.bindVertexArray(null);
  }

  // resolves what selectAt()/setSelected() should actually treat as "the object":
  // a merged node's original sub-object if one was stamped in, otherwise the node itself
  #targetFor(object, pickId) {
    const targets = typeof object.getPickTargets === 'function' ? object.getPickTargets() : null;
    return targets?.get(pickId) ?? object;
  }

  // creates + configures a VAO
  #createBuffers(object, vertices, drawMode, hasTexture) {
    const gl = this.#gl;
    const indices = object.getIndices();

    const positionData = new Float32Array(vertices.flatMap((v) => v.getPosition().toArray()));
    const colorBytes = vertices.flatMap((v) => v.getColor().toBytes());
    const colorData = new Uint8Array(colorBytes);
    const clamp127 = (v) => Math.max(-127, Math.min(127, Math.round(v * 127)));
    const normalBytes = vertices.flatMap((v) => {
      const [nx, ny, nz] = v.getNormal().toArray();
      return [clamp127(nx), clamp127(ny), clamp127(nz), 0]; // pad to 4 for alignment
    });
    const normalData = new Int8Array(normalBytes);

    // whole-object fallback ids, used only for vertices that were never stamped
    // with their own pickId/groupId (e.g. non-merged nodes, where getPickId()/getGroupId() < 0)
    const fallbackPickId = nextPickId();
    const fallbackGroupId = nextPickId();

    const pickColorBytes = [];
    const pickIdData = [];
    const groupColorBytes = [];
    for (const v of vertices) {
      const hasOwnPickId = typeof v.getPickId === 'function' && v.getPickId() >= 0;
      const pickId = hasOwnPickId ? v.getPickId() : fallbackPickId;
      const { bytes: pickBytes } = this.#encodeSelectionId(pickId);

      pickColorBytes.push(pickBytes[0], pickBytes[1], pickBytes[2], 255);
      pickIdData.push(pickId);

      if (!this.#selectionMap.has(pickBytes.join(','))) {
        const target = this.#targetFor(object, pickId);
        this.#selectionMap.set(pickBytes.join(','), target);
        this.#objectToPickId.set(target, pickId);
      }

      const hasOwnGroupId = typeof v.getGroupId === 'function' && v.getGroupId() >= 0;
      const groupId = hasOwnGroupId ? v.getGroupId() : fallbackGroupId;
      const { bytes: groupBytes } = this.#encodeSelectionId(groupId);
      groupColorBytes.push(groupBytes[0], groupBytes[1], groupBytes[2], 255);
    }
    const pickColorData = new Uint8Array(pickColorBytes);
    const pickIdArray = new Float32Array(pickIdData);
    const groupColorData = new Uint8Array(groupColorBytes);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const positionVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionVBO);
    gl.bufferData(gl.ARRAY_BUFFER, positionData, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(this.#shader.getPositionLoc());
    gl.vertexAttribPointer(this.#shader.getPositionLoc(), 3, gl.FLOAT, false, 0, 0);

    const colorVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, colorVBO);
    gl.bufferData(gl.ARRAY_BUFFER, colorData, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(this.#shader.getColorLoc());
    gl.vertexAttribPointer(this.#shader.getColorLoc(), 4, gl.UNSIGNED_BYTE, true, 0, 0);

    let texCoordVBO = null;
    if (hasTexture) {
      const texCoordData = new Float32Array(vertices.flatMap((v) => v.getTexCoord().toArray()));
      texCoordVBO = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, texCoordVBO);
      gl.bufferData(gl.ARRAY_BUFFER, texCoordData, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(this.#shader.getTexCoordLoc());
      gl.vertexAttribPointer(this.#shader.getTexCoordLoc(), 2, gl.FLOAT, false, 0, 0);
    }

    const normalVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, normalVBO);
    gl.bufferData(gl.ARRAY_BUFFER, normalData, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(this.#shader.getNormalLoc());
    gl.vertexAttribPointer(this.#shader.getNormalLoc(), 3, gl.BYTE, true, 4, 0);

    const pickColorVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, pickColorVBO);
    gl.bufferData(gl.ARRAY_BUFFER, pickColorData, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(this.#shader.getPickColorLoc());
    gl.vertexAttribPointer(this.#shader.getPickColorLoc(), 4, gl.UNSIGNED_BYTE, true, 0, 0);

    const pickIdVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, pickIdVBO);
    gl.bufferData(gl.ARRAY_BUFFER, pickIdArray, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(this.#shader.getPickIdLoc());
    gl.vertexAttribPointer(this.#shader.getPickIdLoc(), 1, gl.FLOAT, false, 0, 0);

    const groupColorVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, groupColorVBO);
    gl.bufferData(gl.ARRAY_BUFFER, groupColorData, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(this.#shader.getGroupColorLoc());
    gl.vertexAttribPointer(this.#shader.getGroupColorLoc(), 4, gl.UNSIGNED_BYTE, true, 0, 0);

    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(indices), gl.STATIC_DRAW);

    // stop recording into this VAO
    gl.bindVertexArray(null);

    return {
      verticesRef: vertices,
      drawMode,
      hasTexture,
      vao,
      positionVBO,
      colorVBO,
      texCoordVBO,
      normalVBO,
      pickColorVBO,
      pickIdVBO,
      groupColorVBO,
      indexBuffer,
      indexCount: indices.length,
    };
  }
}