import { buildProgram } from './glUtils.js';
import { COLOR_RAMP_FLAT } from './colorRamp.js';
import vertexSource from '../shaders/waterMeshVertex.glsl?raw';
import fragmentSource from '../shaders/waterMeshFragment.glsl?raw';

// Draws the water surface as a grid generated in the vertex shader (no vertex buffers).
export class WaterMeshRenderer {
    constructor(gl) {
        this.gl = gl;
        this.program = buildProgram(gl, vertexSource, fragmentSource, 'WaterMesh');
        const u = (name) => gl.getUniformLocation(this.program, name);
        this.uViewProjLoc = u('u_viewProj');
        this.uTerrainLoc = u('u_terrain');
        this.uWaterLoc = u('u_water');
        this.uFluxLoc = u('u_flux');
        this.uColumnCountLoc = u('u_columnCount');
        this.uWorldWidthLoc = u('u_worldWidth');
        this.uColorLoc = u('u_color');
        this.uColorModeLoc = u('u_colorMode');
        this.uRangeMaxLoc = u('u_rangeMax');
        this.uUseRampLoc = u('u_useRamp');
        this.uRampLoc = u('u_ramp');
        this.vao = gl.createVertexArray(); // empty: positions come from gl_VertexID

        this.fluxTexture = null;
        this.colorMode = 0;   // 0 none, 1 depth, 2 velocity, 3 flux
        this.rangeMax = 1;
    }

    setFluxTexture(texture) { this.fluxTexture = texture; }
    setWaterColoring(mode, rangeMax) { this.colorMode = mode; this.rangeMax = rangeMax; }

    render(viewProj, terrainTex, waterTex, columnCount, worldWidth, r, g, b) {
        const gl = this.gl;
        gl.useProgram(this.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, terrainTex);
        gl.uniform1i(this.uTerrainLoc, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, waterTex);
        gl.uniform1i(this.uWaterLoc, 1);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, this.fluxTexture);
        gl.uniform1i(this.uFluxLoc, 2);

        gl.uniformMatrix4fv(this.uViewProjLoc, false, viewProj);
        gl.uniform1f(this.uColumnCountLoc, columnCount);
        gl.uniform1f(this.uWorldWidthLoc, worldWidth);
        gl.uniform3f(this.uColorLoc, r, g, b);
        gl.uniform1i(this.uColorModeLoc, this.colorMode);
        gl.uniform1f(this.uRangeMaxLoc, this.rangeMax);
        gl.uniform1f(this.uUseRampLoc, this.colorMode > 0 ? 1.0 : 0.0);
        gl.uniform3fv(this.uRampLoc, COLOR_RAMP_FLAT);

        gl.bindVertexArray(this.vao);
        gl.drawArrays(gl.TRIANGLES, 0, columnCount * columnCount * 6);
        gl.bindVertexArray(null);
    }

    dispose() {
        this.gl.deleteVertexArray(this.vao);
        this.gl.deleteProgram(this.program);
    }
}