import { buildProgram } from './glUtils.js';
import vertexSource from '../shaders/waterMeshVertex.glsl?raw';
import fragmentSource from '../shaders/waterMeshFragment.glsl?raw';

// Draws the water surface as a grid generated in the vertex shader (no vertex buffers).
export class WaterMeshRenderer {
    constructor(gl) {
        this.gl = gl;
        this.program = buildProgram(gl, vertexSource, fragmentSource, 'WaterMesh');
        this.uViewProjLoc = gl.getUniformLocation(this.program, 'u_viewProj');
        this.uTerrainLoc = gl.getUniformLocation(this.program, 'u_terrain');
        this.uWaterLoc = gl.getUniformLocation(this.program, 'u_water');
        this.uColumnCountLoc = gl.getUniformLocation(this.program, 'u_columnCount');
        this.uWorldWidthLoc = gl.getUniformLocation(this.program, 'u_worldWidth');
        this.uColorLoc = gl.getUniformLocation(this.program, 'u_color');
        this.vao = gl.createVertexArray(); // empty: positions come from gl_VertexID
    }

    render(viewProj, terrainTex, waterTex, columnCount, worldWidth, r, g, b) {
        const gl = this.gl;
        gl.useProgram(this.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, terrainTex);
        gl.uniform1i(this.uTerrainLoc, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, waterTex);
        gl.uniform1i(this.uWaterLoc, 1);
        gl.uniformMatrix4fv(this.uViewProjLoc, false, viewProj);
        gl.uniform1f(this.uColumnCountLoc, columnCount);
        gl.uniform1f(this.uWorldWidthLoc, worldWidth);
        gl.uniform3f(this.uColorLoc, r, g, b);

        gl.bindVertexArray(this.vao);
        gl.drawArrays(gl.TRIANGLES, 0, columnCount * columnCount * 6);
        gl.bindVertexArray(null);
    }

    dispose() {
        this.gl.deleteVertexArray(this.vao);
        this.gl.deleteProgram(this.program);
    }
}