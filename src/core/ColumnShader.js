import { buildProgram } from './glUtils.js';
import columnVertexSrc from '../shaders/columnVertex.glsl?raw';
import columnFragmentSrc from '../shaders/columnFragment.glsl?raw';

export class ColumnShader {
    constructor(gl) {
        this.gl = gl;
        this.program = buildProgram(gl, columnVertexSrc, columnFragmentSrc, 'Column');
        this.indexLoc = gl.getAttribLocation(this.program, 'a_index');
        this.cornerLoc = gl.getAttribLocation(this.program, 'a_corner');
        this.uWaterLoc = gl.getUniformLocation(this.program, 'u_water');
        this.uTerrainLoc = gl.getUniformLocation(this.program, 'u_terrain');
        this.uColumnCountLoc = gl.getUniformLocation(this.program, 'u_columnCount');
        this.uMaxHeightLoc = gl.getUniformLocation(this.program, 'u_maxHeight');
        this.uGapFractionLoc = gl.getUniformLocation(this.program, 'u_gapFraction');
        this.uColorLoc = gl.getUniformLocation(this.program, 'u_color');
        this.uDrawTerrainLoc = gl.getUniformLocation(this.program, 'u_drawTerrain');
    }
}
