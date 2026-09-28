import { buildProgram } from './glUtils.js';
import vertexSource from '../shaders/terrainMeshVertex.glsl?raw';
import fragmentSource from '../shaders/terrainMeshFragment.glsl?raw';
import { MireiaTerrainMesh, proceduralHeightSampler } from '../geo/MireiaTerrainMesh.js';

// Builds the sampled terrain on the CPU, uploads it once, then draws indexed triangles.
export class TerrainMeshRenderer {
    constructor(gl) {
        this.gl = gl;
        this.program = buildProgram(gl, vertexSource, fragmentSource, 'TerrainMesh');
        this.positionLoc = gl.getAttribLocation(this.program, 'a_position');
        this.normalLoc = gl.getAttribLocation(this.program, 'a_normal');
        this.texCoordLoc = gl.getAttribLocation(this.program, 'a_texCoord');
        this.uViewProjLoc = gl.getUniformLocation(this.program, 'u_viewProj');
        this.uColorLoc = gl.getUniformLocation(this.program, 'u_color');
        this.uLitLoc = gl.getUniformLocation(this.program, 'u_lit');
        this.uTextureLoc = gl.getUniformLocation(this.program, 'u_texture');
        this.uUseTextureLoc = gl.getUniformLocation(this.program, 'u_useTexture');

        this.vao = null;
        this.vertexBuffer = null;
        this.indexBuffer = null;
        this.indexCount = 0;
        this.imageryTexture = null;
    }

    build(worldWidth, heightScale, seed, resolution = 100) {
        this.buildFromSampler(proceduralHeightSampler(worldWidth, heightScale, seed), worldWidth, resolution);
    }

    buildFromSampler(heightSampler, worldWidth, resolution = 100) {
        const gl = this.gl;
        this.dispose();

        // Pack each vertex as position, normal, and imagery UV.
        const mesh = new MireiaTerrainMesh(heightSampler, worldWidth, worldWidth, resolution);
        const vertices = mesh.getVertices();
        const indices = mesh.getScene().getRoot().getIndices();

        const data = new Float32Array(vertices.length * 8);
        for (let i = 0; i < vertices.length; i++) {
            const p = vertices[i].getPosition();
            const n = vertices[i].getNormal();
            const uv = vertices[i].getTexCoord();
            data.set([p.getX(), p.getY(), p.getZ(), n.getX(), n.getY(), n.getZ(), uv.getX(), uv.getY()], i * 8);
        }

        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);

        this.vertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

        const stride = 8 * Float32Array.BYTES_PER_ELEMENT;
        gl.enableVertexAttribArray(this.positionLoc);
        gl.vertexAttribPointer(this.positionLoc, 3, gl.FLOAT, false, stride, 0);
        gl.enableVertexAttribArray(this.normalLoc);
        gl.vertexAttribPointer(this.normalLoc, 3, gl.FLOAT, false, stride, 3 * Float32Array.BYTES_PER_ELEMENT);
        gl.enableVertexAttribArray(this.texCoordLoc);
        gl.vertexAttribPointer(this.texCoordLoc, 2, gl.FLOAT, false, stride, 6 * Float32Array.BYTES_PER_ELEMENT);

        this.indexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(indices), gl.STATIC_DRAW);
        this.indexCount = indices.length;

        gl.bindVertexArray(null);
    }

    setImageryTexture(texture) { this.imageryTexture = texture; }
    clearImageryTexture() { this.imageryTexture = null; }

    render(viewProjMatrix, r, g, b) {
        const gl = this.gl;
        if (!this.vao) return; // build() hasn't run yet

        gl.useProgram(this.program);
        gl.uniformMatrix4fv(this.uViewProjLoc, false, viewProjMatrix);
        gl.uniform3f(this.uColorLoc, r, g, b);
        gl.uniform1f(this.uLitLoc, 1.0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.imageryTexture);
        gl.uniform1i(this.uTextureLoc, 0);
        gl.uniform1f(this.uUseTextureLoc, this.imageryTexture ? 1.0 : 0.0);

        gl.bindVertexArray(this.vao);
        gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_INT, 0);
        gl.bindVertexArray(null);
    }

    dispose() {
        const gl = this.gl;
        if (this.vao) gl.deleteVertexArray(this.vao);
        if (this.vertexBuffer) gl.deleteBuffer(this.vertexBuffer);
        if (this.indexBuffer) gl.deleteBuffer(this.indexBuffer);
        this.vao = null;
        this.vertexBuffer = null;
        this.indexBuffer = null;
        this.indexCount = 0;
    }
}