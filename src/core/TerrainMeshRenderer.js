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
        this.imageryTexture = null; // optional satellite imagery draped over the mesh - see setImageryTexture()
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

        // position(3) + normal(3) + texCoord(2) per vertex - texCoord is only used when
        // an imagery texture is set (see render()); with none set the shader falls back
        // to flat u_color exactly as before, so this costs nothing when unused.
        const data = new Float32Array(vertices.length * 8);
        for (let i = 0; i < vertices.length; i++) {
            const p = vertices[i].getPosition();
            const n = vertices[i].getNormal();
            const uv = vertices[i].getTexCoord(); // NOTE: assumes MireiaVertex exposes this - if the
                                                   // real getter is named differently, this throws here
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

    // Satellite imagery draped over the mesh using each vertex's baked-in UV. Doesn't
    // own the texture (main.js does, since the same texture is also handed to
    // ColumnRenderer), so this never deletes it, just stops using it.
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