import { HeightUpdateShader } from './HeightUpdateShader.js';

export class HeightUpdateRenderer {
    constructor(gl) {
        this.gl = gl;
        this.shader = new HeightUpdateShader(gl);
        this._buildQuad();
    }

    _buildQuad() {
        const gl = this.gl;
        const data = new Float32Array([
            -1, -1, 0,  0, 0,
             1, -1, 0,  1, 0,
             1,  1, 0,  1, 1,
            -1, -1, 0,  0, 0,
             1,  1, 0,  1, 1,
            -1,  1, 0,  0, 1,
        ]);

        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);

        this.vertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

        const stride = 5 * Float32Array.BYTES_PER_ELEMENT;
        const { positionLoc, texCoordLoc } = this.shader;
        gl.enableVertexAttribArray(positionLoc);
        gl.vertexAttribPointer(positionLoc, 3, gl.FLOAT, false, stride, 0);

        gl.enableVertexAttribArray(texCoordLoc);
        gl.vertexAttribPointer(texCoordLoc, 2, gl.FLOAT, false, stride, 3 * Float32Array.BYTES_PER_ELEMENT);

        gl.bindVertexArray(null);
    }

    // heightTexId = current WaterFBO texture (last frame's water depth/velocity)
    // fluxTexId   = NEW FluxFBO texture
    // pourStart*/pourEnd* = column rectangle receiving the pour (end is exclusive);
    // pourRate = depth/second, pass 0 when nothing should be poured this frame
    // (preview, paused, or pour finished)
    render(heightTexId, fluxTexId, columnCount, columnArea, dt, minHeight,
           pourStartCol, pourStartRow, pourEndCol, pourEndRow, pourRate) {
        const gl = this.gl;
        gl.useProgram(this.shader.program);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, heightTexId);
        gl.uniform1i(this.shader.uHeightLoc, 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, fluxTexId);
        gl.uniform1i(this.shader.uFluxLoc, 1);

        gl.uniform1f(this.shader.uTexelLoc, 1.0 / columnCount);
        gl.uniform1f(this.shader.uColumnCountLoc, columnCount);
        gl.uniform1f(this.shader.uColumnAreaLoc, columnArea);
        gl.uniform1f(this.shader.uDtLoc, dt);
        gl.uniform1f(this.shader.uMinHeightLoc, minHeight);
        gl.uniform2f(this.shader.uPourStartLoc, pourStartCol, pourStartRow);
        gl.uniform2f(this.shader.uPourEndLoc, pourEndCol, pourEndRow);
        gl.uniform1f(this.shader.uPourRateLoc, pourRate);

        gl.bindVertexArray(this.vao);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.bindVertexArray(null);
    }
}