import { ColumnShader } from './ColumnShader.js';

const QUAD_CORNERS = [
    0, 0,   1, 0,   1, 1,
    0, 0,   1, 1,   0, 1,
];

const OUTLINE_CORNERS = [
    0, 0,   1, 0,     // bottom edge
    1, 0,   1, 1,     // right edge
    1, 1,   0, 1,     // top edge
    0, 1,   0, 0,     // left edge
];

// Draws each column as a filled vertical bar, in two layers:
// 1. the fixed terrain (floor -> terrain height)
// 2. the water sitting on top of it (terrain height -> terrain height + water depth)
export class ColumnRenderer {
    constructor(gl, columnCount) {
        this.gl = gl;
        this.shader = new ColumnShader(gl);
        this.columnCount = columnCount;
        this.gapFraction = 0.1;

        const vaoA = this._buildVao(QUAD_CORNERS, 6);
        this.vao = vaoA.vao;
        this.vbo = vaoA.vbo;

        const vaoB = this._buildVao(OUTLINE_CORNERS, 8);
        this.outlineVao = vaoB.vao;
        this.outlineVbo = vaoB.vbo;
    }

    _buildVao(cornerTable, verticesPerColumn) {
        const gl = this.gl;
        const data = new Float32Array(this.columnCount * verticesPerColumn * 3);
        let p = 0;
        for (let i = 0; i < this.columnCount; i++) {
            for (let c = 0; c < verticesPerColumn; c++) {
                data[p++] = i;
                data[p++] = cornerTable[c * 2];
                data[p++] = cornerTable[c * 2 + 1];
            }
        }

        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);

        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

        const stride = 3 * Float32Array.BYTES_PER_ELEMENT;
        const { indexLoc, cornerLoc } = this.shader;
        gl.enableVertexAttribArray(indexLoc);
        gl.vertexAttribPointer(indexLoc, 1, gl.FLOAT, false, stride, 0);

        gl.enableVertexAttribArray(cornerLoc);
        gl.vertexAttribPointer(cornerLoc, 2, gl.FLOAT, false, stride, Float32Array.BYTES_PER_ELEMENT);

        gl.bindVertexArray(null);
        return { vao, vbo };
    }

    setGapFraction(gapFraction) { this.gapFraction = gapFraction; }

    _bindTextures(terrainTexId, waterTexId) {
        const gl = this.gl;
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, waterTexId);
        gl.uniform1i(this.shader.uWaterLoc, 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, terrainTexId);
        gl.uniform1i(this.shader.uTerrainLoc, 1);
    }

    // draws the terrain: floor(0) -> each column's fixed terrain height
    renderTerrain(terrainTexId, maxHeight, r, g, b) {
        const gl = this.gl;
        gl.useProgram(this.shader.program);
        this._bindTextures(terrainTexId, terrainTexId);
        gl.uniform1f(this.shader.uColumnCountLoc, this.columnCount);
        gl.uniform1f(this.shader.uMaxHeightLoc, maxHeight);
        gl.uniform1f(this.shader.uGapFractionLoc, this.gapFraction);
        gl.uniform3f(this.shader.uColorLoc, r, g, b);
        gl.uniform1i(this.shader.uDrawTerrainLoc, 1);

        gl.bindVertexArray(this.vao);
        gl.drawArrays(gl.TRIANGLES, 0, this.columnCount * 6);
        gl.bindVertexArray(null);
    }

    // draws the water: each column's terrain height -> terrain height + water depth
    renderWater(terrainTexId, waterTexId, maxHeight, r, g, b) {
        const gl = this.gl;
        gl.useProgram(this.shader.program);
        this._bindTextures(terrainTexId, waterTexId);
        gl.uniform1f(this.shader.uColumnCountLoc, this.columnCount);
        gl.uniform1f(this.shader.uMaxHeightLoc, maxHeight);
        gl.uniform1f(this.shader.uGapFractionLoc, this.gapFraction);
        gl.uniform3f(this.shader.uColorLoc, r, g, b);
        gl.uniform1i(this.shader.uDrawTerrainLoc, 0);

        gl.bindVertexArray(this.vao);
        gl.drawArrays(gl.TRIANGLES, 0, this.columnCount * 6);
        gl.bindVertexArray(null);
    }

    // same water bars again, as gl.LINES around each one's 4 edges -
    // call this right after renderWater() so the outline draws on top of the fill
    renderWaterOutline(terrainTexId, waterTexId, maxHeight, r, g, b) {
        const gl = this.gl;
        gl.useProgram(this.shader.program);
        this._bindTextures(terrainTexId, waterTexId);
        gl.uniform1f(this.shader.uColumnCountLoc, this.columnCount);
        gl.uniform1f(this.shader.uMaxHeightLoc, maxHeight);
        gl.uniform1f(this.shader.uGapFractionLoc, this.gapFraction);
        gl.uniform3f(this.shader.uColorLoc, r, g, b);
        gl.uniform1i(this.shader.uDrawTerrainLoc, 0);

        gl.bindVertexArray(this.outlineVao);
        gl.drawArrays(gl.LINES, 0, this.columnCount * 8);
        gl.bindVertexArray(null);
    }

    dispose() {
        const gl = this.gl;
        gl.deleteVertexArray(this.vao);
        gl.deleteBuffer(this.vbo);
        gl.deleteVertexArray(this.outlineVao);
        gl.deleteBuffer(this.outlineVbo);
    }
}
