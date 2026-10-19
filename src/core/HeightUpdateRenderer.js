import { HeightUpdateShader } from './HeightUpdateShader.js';
import { createFullscreenQuad } from './FullscreenQuad.js';

// Applies this step's flux to water depth across the grid.
export class HeightUpdateRenderer {
    constructor(gl) {
        this.gl = gl;
        this.shader = new HeightUpdateShader(gl);
        this.vao = createFullscreenQuad(gl, this.shader.positionLoc, this.shader.texCoordLoc);
    }

    // Pour bounds are column coordinates with an exclusive end; zero rate disables pouring.
    render(heightTexId, fluxTexId, cellAreaTexId, columnCount, columnArea, dt, minHeight,
           pourStartCol, pourStartRow, pourEndCol, pourEndRow, pourRate) {
        const gl = this.gl;
        gl.useProgram(this.shader.program);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, heightTexId);
        gl.uniform1i(this.shader.uHeightLoc, 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, fluxTexId);
        gl.uniform1i(this.shader.uFluxLoc, 1);

        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, cellAreaTexId);
        gl.uniform1i(this.shader.uCellAreaLoc, 2);

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