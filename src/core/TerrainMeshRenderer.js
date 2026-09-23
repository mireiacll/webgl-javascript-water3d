import { buildProgram } from './glUtils.js';
import vertexSource from '../shaders/terrainMeshVertex.glsl?raw';
import fragmentSource from '../shaders/terrainMeshFragment.glsl?raw'; // same shader columnFragment.glsl uses
import { MireiaTerrainMesh, proceduralHeightSampler } from '../geo/MireiaTerrainMesh.js';

// Draws the terrain as a real triangulated mesh (via MireiaTerrainMesh's
// Vertex/Triangle/Surface/Primitive/Mesh/Node/Scene pipeline), independent of
// ColumnRenderer's instanced boxes - ColumnRenderer still draws the water columns
// exactly as before, this class only replaces the old renderTerrain() box draw.
//
// Deliberately doesn't go through the engine's Renderer/Shader/MireiaFBO - this is
// a standalone GPU upload + draw, sized for one static mesh, not a general scene graph.
export class TerrainMeshRenderer {
    constructor(gl) {
        this.gl = gl;
        this.program = buildProgram(gl, vertexSource, fragmentSource, 'TerrainMesh');
        this.positionLoc = gl.getAttribLocation(this.program, 'a_position');
        this.normalLoc = gl.getAttribLocation(this.program, 'a_normal');
        this.uViewProjLoc = gl.getUniformLocation(this.program, 'u_viewProj');
        this.uColorLoc = gl.getUniformLocation(this.program, 'u_color');
        this.uLitLoc = gl.getUniformLocation(this.program, 'u_lit');

        this.vao = null;
        this.vertexBuffer = null;
        this.indexBuffer = null;
        this.indexCount = 0;
    }

    // (re)builds the mesh from the same procedural height function
    // TerrainHeightTextureBuilder.js uses for the sim's terrain texture - same
    // worldWidth/heightScale/seed here means the visual mesh and the water sim's
    // terrain agree on shape, even though one samples it as a continuous function
    // and the other bakes it into a per-column texture.
    build(worldWidth, heightScale, seed, resolution = 100) {
        this.buildFromSampler(proceduralHeightSampler(worldWidth, heightScale, seed), worldWidth, resolution);
    }

    // same mesh-building logic, but driven by any height(x, y) function - used directly
    // for real elevation data (heightfieldSampler from MireiaTerrainMesh.js), so the
    // procedural path above is really just one caller of this, not a separate code path
    buildFromSampler(heightSampler, worldWidth, resolution = 100) {
        const gl = this.gl;
        this.dispose();

        const mesh = new MireiaTerrainMesh(heightSampler, worldWidth, worldWidth, resolution);
        const vertices = mesh.getVertices();
        const indices = mesh.getScene().getRoot().getIndices(); // also assigns each vertex's buffer index

        // position(3) + normal(3) per vertex - no color/texcoord attribute, since the
        // whole terrain is drawn as one flat u_color like ColumnRenderer already does
        const data = new Float32Array(vertices.length * 6);
        for (let i = 0; i < vertices.length; i++) {
            const p = vertices[i].getPosition();
            const n = vertices[i].getNormal();
            data.set([p.getX(), p.getY(), p.getZ(), n.getX(), n.getY(), n.getZ()], i * 6);
        }

        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);

        this.vertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

        const stride = 6 * Float32Array.BYTES_PER_ELEMENT;
        gl.enableVertexAttribArray(this.positionLoc);
        gl.vertexAttribPointer(this.positionLoc, 3, gl.FLOAT, false, stride, 0);
        gl.enableVertexAttribArray(this.normalLoc);
        gl.vertexAttribPointer(this.normalLoc, 3, gl.FLOAT, false, stride, 3 * Float32Array.BYTES_PER_ELEMENT);

        this.indexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(indices), gl.STATIC_DRAW);
        this.indexCount = indices.length;

        gl.bindVertexArray(null);
    }

    render(viewProjMatrix, r, g, b) {
        const gl = this.gl;
        if (!this.vao) return; // build() hasn't run yet

        gl.useProgram(this.program);
        gl.uniformMatrix4fv(this.uViewProjLoc, false, viewProjMatrix);
        gl.uniform3f(this.uColorLoc, r, g, b);
        gl.uniform1f(this.uLitLoc, 1.0);

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