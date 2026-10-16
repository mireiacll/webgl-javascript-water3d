import { buildProgram } from './glUtils.js';
import vertexSource from '../shaders/buildingVertex.glsl?raw';
import fragmentSource from '../shaders/buildingFragment.glsl?raw';

// Draws all extruded buildings as one non-indexed triangle list (flat-shaded, one normal per triangle).
export class BuildingMeshRenderer {
    constructor(gl) {
        this.gl = gl;
        this.program = buildProgram(gl, vertexSource, fragmentSource, 'Buildings');
        this.positionLoc = gl.getAttribLocation(this.program, 'a_position');
        this.normalLoc = gl.getAttribLocation(this.program, 'a_normal');
        this.uViewProjLoc = gl.getUniformLocation(this.program, 'u_viewProj');
        this.uColorLoc = gl.getUniformLocation(this.program, 'u_color');
        this.vao = null;
        this.positionBuffer = null;
        this.normalBuffer = null;
        this.vertexCount = 0;
    }

    setGeometry(positions, normals) {
        const gl = this.gl;
        this.clear();
        if (positions.length === 0) return;

        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);

        this.positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(this.positionLoc);
        gl.vertexAttribPointer(this.positionLoc, 3, gl.FLOAT, false, 0, 0);

        this.normalBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(this.normalLoc);
        gl.vertexAttribPointer(this.normalLoc, 3, gl.FLOAT, false, 0, 0);

        this.vertexCount = positions.length / 3;
        gl.bindVertexArray(null);
    }

    render(viewProj, r, g, b) {
        const gl = this.gl;
        if (!this.vao) return;

        gl.useProgram(this.program);
        gl.uniformMatrix4fv(this.uViewProjLoc, false, viewProj);
        gl.uniform3f(this.uColorLoc, r, g, b);

        // Triangle winding comes from the extruder, so draw both sides rather than trust it.
        const culling = gl.isEnabled(gl.CULL_FACE);
        gl.disable(gl.CULL_FACE);
        gl.bindVertexArray(this.vao);
        gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
        gl.bindVertexArray(null);
        if (culling) gl.enable(gl.CULL_FACE);
    }

    clear() {
        const gl = this.gl;
        if (this.vao) gl.deleteVertexArray(this.vao);
        if (this.positionBuffer) gl.deleteBuffer(this.positionBuffer);
        if (this.normalBuffer) gl.deleteBuffer(this.normalBuffer);
        this.vao = null;
        this.positionBuffer = null;
        this.normalBuffer = null;
        this.vertexCount = 0;
    }

    dispose() {
        this.clear();
        this.gl.deleteProgram(this.program);
    }
}