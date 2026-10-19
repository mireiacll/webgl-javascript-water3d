import { FluxUpdateShader } from './FluxUpdateShader.js';
import { createFullscreenQuad } from './FullscreenQuad.js';

// Runs the flux shader once per grid cell using a full-screen quad.
export class FluxUpdateRenderer {
    constructor(gl) {
        this.gl = gl;
        this.shader = new FluxUpdateShader(gl);
        this.vao = createFullscreenQuad(gl, this.shader.positionLoc, this.shader.texCoordLoc);
    }

    render(heightTexId, fluxTexId, terrainTexId, cellAreaTexId, edgeOpenTexId, columnCount, pipeArea, pipeLength, dt, damping, openBoundary) {
        const gl = this.gl;
        gl.useProgram(this.shader.program);

        // Bind the previous water/flux state and the fixed terrain field.
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, heightTexId);
        gl.uniform1i(this.shader.uHeightLoc, 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, fluxTexId);
        gl.uniform1i(this.shader.uFluxLoc, 1);

        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, terrainTexId);
        gl.uniform1i(this.shader.uTerrainLoc, 2);

        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, cellAreaTexId);
        gl.uniform1i(this.shader.uCellAreaLoc, 3);

        gl.activeTexture(gl.TEXTURE4);
        gl.bindTexture(gl.TEXTURE_2D, edgeOpenTexId);
        gl.uniform1i(this.shader.uEdgeOpenLoc, 4);

        gl.uniform1f(this.shader.uTexelLoc, 1.0 / columnCount);
        gl.uniform1f(this.shader.uColumnCountLoc, columnCount);
        gl.uniform1f(this.shader.uPipeAreaLoc, pipeArea);
        gl.uniform1f(this.shader.uPipeLengthLoc, pipeLength);
        gl.uniform1f(this.shader.uDtLoc, dt);
        gl.uniform1f(this.shader.uDampingLoc, damping);
        gl.uniform1f(this.shader.uOpenBoundaryLoc, openBoundary);

        gl.bindVertexArray(this.vao);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.bindVertexArray(null);
    }
}