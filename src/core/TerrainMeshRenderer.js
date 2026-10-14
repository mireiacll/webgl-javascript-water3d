import { buildProgram } from './glUtils.js';
import vertexSource from '../shaders/terrainMeshVertex.glsl?raw';
import fragmentSource from '../shaders/terrainMeshFragment.glsl?raw';
import { proceduralHeightSampler } from '../geo/MireiaTerrainMesh.js';

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

        const side = resolution + 1;
        const vertexCount = side * side;
        const heights = new Float32Array(vertexCount);
        const data = new Float32Array(vertexCount * 8);
        const indices = new Uint32Array(resolution * resolution * 6);
        const spacing = worldWidth / resolution;

        for (let row = 0; row < side; row++) {
            const y = row * spacing;
            for (let col = 0; col < side; col++) {
                const x = col * spacing;
                heights[row * side + col] = heightSampler(x, y);
            }
        }

        for (let row = 0; row < side; row++) {
            const y = row * spacing;
            const lowerRow = Math.max(0, row - 1);
            const upperRow = Math.min(resolution, row + 1);
            for (let col = 0; col < side; col++) {
                const leftCol = Math.max(0, col - 1);
                const rightCol = Math.min(resolution, col + 1);
                const index = row * side + col;
                const z = heights[index];
                const dzdx = (heights[row * side + rightCol] - heights[row * side + leftCol]) / ((rightCol - leftCol) * spacing || 1);
                const dzdy = (heights[upperRow * side + col] - heights[lowerRow * side + col]) / ((upperRow - lowerRow) * spacing || 1);
                const normalLength = Math.hypot(dzdx, dzdy, 1);
                const offset = index * 8;
                data.set([
                    col * spacing, y, z,
                    -dzdx / normalLength, -dzdy / normalLength, 1 / normalLength,
                    col / resolution, 1 - row / resolution,
                ], offset);
            }
        }

        let indexOffset = 0;
        for (let row = 0; row < resolution; row++) {
            for (let col = 0; col < resolution; col++) {
                const sw = row * side + col;
                const se = sw + 1;
                const nw = sw + side;
                const ne = nw + 1;
                indices.set([sw, se, ne, sw, ne, nw], indexOffset);
                indexOffset += 6;
            }
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
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
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