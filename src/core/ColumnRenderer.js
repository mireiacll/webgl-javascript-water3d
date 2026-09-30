import { ColumnShader } from './ColumnShader.js';
import { COLOR_RAMP_FLAT } from './colorRamp.js';

const LAYER_TERRAIN = 0;
const LAYER_WATER = 1;

const BOX_VERTEX_COUNT = 30;
const EDGE_VERTEX_COUNT = 16;

// Instanced column geometry used for water and the optional block terrain view.
export class ColumnRenderer {
    constructor(gl, columnCount) {
        this.gl = gl;
        this.columnCount = columnCount;
        this.gapFraction = 0.0;
        this.viewProj = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

        this.shader = new ColumnShader(gl);
        this.imageryTexture = null;

        // Water coloring (depth / velocity / flux); looked up here so ColumnShader stays untouched.
        const u = (name) => gl.getUniformLocation(this.shader.program, name);
        this.uFluxLoc = u('u_flux');
        this.uColorModeLoc = u('u_colorMode');
        this.uRangeMaxLoc = u('u_rangeMax');
        this.uUseRampLoc = u('u_useRamp');
        this.uRampLoc = u('u_ramp');
        this.fluxTexture = null;
        this.colorMode = 0;   // 0 none, 1 depth, 2 velocity, 3 flux
        this.rangeMax = 1;

        this._buildBox();
        this._buildEdges();
    }

    _buildBox() {
        const gl = this.gl;
        // Five box faces; the hidden bottom face is omitted.
        const faces = [
            { n: [0, 0, 1],  c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
            { n: [1, 0, 0],  c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
            { n: [-1, 0, 0], c: [[0, 1, 0], [0, 0, 0], [0, 0, 1], [0, 1, 1]] },
            { n: [0, 1, 0],  c: [[1, 1, 0], [0, 1, 0], [0, 1, 1], [1, 1, 1]] },
            { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
        ];
        const data = [];
        for (const { n, c } of faces) {
            for (const i of [0, 1, 2, 0, 2, 3]) {
                data.push(...c[i], ...n);
            }
        }

        this.boxVao = gl.createVertexArray();
        gl.bindVertexArray(this.boxVao);

        this.boxBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.boxBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);

        const stride = 6 * Float32Array.BYTES_PER_ELEMENT;
        gl.enableVertexAttribArray(this.shader.cornerLoc);
        gl.vertexAttribPointer(this.shader.cornerLoc, 3, gl.FLOAT, false, stride, 0);
        gl.enableVertexAttribArray(this.shader.normalLoc);
        gl.vertexAttribPointer(this.shader.normalLoc, 3, gl.FLOAT, false, stride, 3 * Float32Array.BYTES_PER_ELEMENT);

        gl.bindVertexArray(null);
    }

    _buildEdges() {
        const gl = this.gl;
        // Four top edges and four vertical edges per column.
        const top = [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
        const bottom = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]];
        const data = [];
        for (let i = 0; i < 4; i++) {
            data.push(...top[i], ...top[(i + 1) % 4]);
            data.push(...bottom[i], ...top[i]);
        }

        this.edgeVao = gl.createVertexArray();
        gl.bindVertexArray(this.edgeVao);

        this.edgeBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);

        gl.enableVertexAttribArray(this.shader.cornerLoc);
        gl.vertexAttribPointer(this.shader.cornerLoc, 3, gl.FLOAT, false, 0, 0);
        gl.disableVertexAttribArray(this.shader.normalLoc);

        gl.bindVertexArray(null);
    }

    setGapFraction(fraction) { this.gapFraction = fraction; }

    setImageryTexture(texture) { this.imageryTexture = texture; }
    clearImageryTexture() { this.imageryTexture = null; }

    setCamera(viewProj) { this.viewProj = viewProj; }

    setFluxTexture(texture) { this.fluxTexture = texture; }
    setWaterColoring(mode, rangeMax) { this.colorMode = mode; this.rangeMax = rangeMax; }

    renderTerrain(terrainTex, worldWidth, r, g, b) {
        this._drawFill(LAYER_TERRAIN, terrainTex, terrainTex, worldWidth, r, g, b);
    }

    renderWater(terrainTex, waterTex, worldWidth, r, g, b) {
        this._drawFill(LAYER_WATER, terrainTex, waterTex, worldWidth, r, g, b);
    }

    renderWaterOutline(terrainTex, waterTex, worldWidth, r, g, b) {
        const gl = this.gl;
        this._setUniforms(LAYER_WATER, terrainTex, waterTex, worldWidth, r, g, b, 0.0);
        gl.bindVertexArray(this.edgeVao);
        gl.drawArraysInstanced(gl.LINES, 0, EDGE_VERTEX_COUNT, this.columnCount * this.columnCount);
        gl.bindVertexArray(null);
    }

    _drawFill(layer, terrainTex, waterTex, worldWidth, r, g, b) {
        const gl = this.gl;
        this._setUniforms(layer, terrainTex, waterTex, worldWidth, r, g, b, 1.0);

        if (this.gapFraction > 0) {
            gl.enable(gl.POLYGON_OFFSET_FILL);
            gl.polygonOffset(-1, -1);
        } else {
            gl.disable(gl.POLYGON_OFFSET_FILL);
        }
        gl.bindVertexArray(this.boxVao);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, BOX_VERTEX_COUNT, this.columnCount * this.columnCount);
        gl.bindVertexArray(null);
        gl.disable(gl.POLYGON_OFFSET_FILL);
    }

    _setUniforms(layer, terrainTex, waterTex, worldWidth, r, g, b, lit) {
        const gl = this.gl;
        const sh = this.shader;
        gl.useProgram(sh.program);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, terrainTex);
        gl.uniform1i(sh.uTerrainLoc, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, waterTex);
        gl.uniform1i(sh.uWaterLoc, 1);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, this.imageryTexture);
        gl.uniform1i(sh.uTextureLoc, 2);
        gl.uniform1f(sh.uUseTextureLoc, (layer === LAYER_TERRAIN && this.imageryTexture) ? 1.0 : 0.0);

        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, this.fluxTexture);
        gl.uniform1i(this.uFluxLoc, 3);
        gl.uniform1i(this.uColorModeLoc, this.colorMode);
        gl.uniform1f(this.uRangeMaxLoc, this.rangeMax);
        // Ramp only on water fills (lit = 1), never on terrain or the outline lines.
        gl.uniform1f(this.uUseRampLoc, (layer === LAYER_WATER && lit > 0.5 && this.colorMode > 0) ? 1.0 : 0.0);
        gl.uniform3fv(this.uRampLoc, COLOR_RAMP_FLAT);

        gl.uniformMatrix4fv(sh.uViewProjLoc, false, this.viewProj);
        gl.uniform1f(sh.uColumnCountLoc, this.columnCount);
        gl.uniform1f(sh.uWorldWidthLoc, worldWidth);
        gl.uniform1f(sh.uGapFractionLoc, this.gapFraction);
        gl.uniform1i(sh.uLayerLoc, layer);
        gl.uniform3f(sh.uColorLoc, r, g, b);
        gl.uniform1f(sh.uLitLoc, lit);
    }

    dispose() {
        const gl = this.gl;
        gl.deleteVertexArray(this.boxVao);
        gl.deleteVertexArray(this.edgeVao);
        gl.deleteBuffer(this.boxBuffer);
        gl.deleteBuffer(this.edgeBuffer);
        gl.deleteProgram(this.shader.program);
    }
}