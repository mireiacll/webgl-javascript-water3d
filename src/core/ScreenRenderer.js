import { ScreenShader } from './ScreenShader.js';

export class ScreenRenderer {
  #gl;
  #shader;
  #vao;
  #vertexBuffer;

  constructor(gl) {
    this.#gl = gl;
    this.#shader = new ScreenShader(gl);
    this.#vao = null;
    this.#vertexBuffer = null;
    this.#buildQuad();
  }

  getShader() { return this.#shader; }

  #buildQuad() {
    const gl = this.#gl;

    // interleaved: position(3) + texCoord(2) = 5 floats per vertex,
    // a full-screen quad made of 2 triangles (6 vertices, no index buffer needed)
    const data = new Float32Array([
      -1, -1, 0,  0, 0,
       1, -1, 0,  1, 0,
       1,  1, 0,  1, 1,

      -1, -1, 0,  0, 0,
       1,  1, 0,  1, 1,
      -1,  1, 0,  0, 1,
    ]);

    this.#vao = gl.createVertexArray();
    gl.bindVertexArray(this.#vao);

    this.#vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

    const stride = 5 * Float32Array.BYTES_PER_ELEMENT;

    gl.enableVertexAttribArray(this.#shader.getPositionLoc());
    gl.vertexAttribPointer(this.#shader.getPositionLoc(), 3, gl.FLOAT, false, stride, 0);

    gl.enableVertexAttribArray(this.#shader.getTexCoordLoc());
    gl.vertexAttribPointer(this.#shader.getTexCoordLoc(), 2, gl.FLOAT, false, stride, 3 * 4);

    gl.bindVertexArray(null);
  }

  // draws the given texture full-screen, using its own dedicated shader
  render(texture, normalTexture, depthTexture, canvasWidth, canvasHeight, isDepthMode = false) {
    const gl = this.#gl;

    gl.useProgram(this.#shader.getProgram());
    gl.bindVertexArray(this.#vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(this.#shader.getTextureLoc(), 0);
    gl.uniform1f(this.#shader.getIsDepthModeLoc(), isDepthMode ? 1.0 : 0.0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, normalTexture);
    gl.uniform1i(this.#shader.getNormalTextureLoc(), 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, depthTexture);
    gl.uniform1i(this.#shader.getDepthTextureLoc(), 2);

    gl.uniform2f(this.#shader.getTexelSizeLoc(), 1 / canvasWidth, 1 / canvasHeight);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindVertexArray(null);
  }
}