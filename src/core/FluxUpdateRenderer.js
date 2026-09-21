import { FluxUpdateShader } from './FluxUpdateShader.js';

export class FluxUpdateRenderer {
    constructor(gl) {
        this.gl = gl;
        this.shader = new FluxUpdateShader(gl);
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

    // heightTexId  = current WaterFBO texture (last frame's water depth/velocity)
    // fluxTexId    = current FluxFBO texture (last frame's flux)
    // terrainTexId = the fixed terrain height texture (never ping-pongs)
    render(heightTexId, fluxTexId, terrainTexId, columnCount, pipeArea, pipeLength, dt, damping) {
        const gl = this.gl;
        gl.useProgram(this.shader.program);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, heightTexId);
        gl.uniform1i(this.shader.uHeightLoc, 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, fluxTexId);
        gl.uniform1i(this.shader.uFluxLoc, 1);

        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, terrainTexId);
        gl.uniform1i(this.shader.uTerrainLoc, 2);

        gl.uniform1f(this.shader.uTexelXLoc, 1.0 / columnCount);
        gl.uniform1f(this.shader.uColumnCountLoc, columnCount);
        gl.uniform1f(this.shader.uPipeAreaLoc, pipeArea);
        gl.uniform1f(this.shader.uPipeLengthLoc, pipeLength);
        gl.uniform1f(this.shader.uDtLoc, dt);
        gl.uniform1f(this.shader.uDampingLoc, damping);

        gl.bindVertexArray(this.vao);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.bindVertexArray(null);
    }
}
