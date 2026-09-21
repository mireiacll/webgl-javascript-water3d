import { buildProgram } from './glUtils.js';
import screenVertexSrc from '../shaders/screenVertex.glsl?raw'; // reused as-is
import heightUpdateFragmentSrc from '../shaders/heightUpdateFragment.glsl?raw';

export class HeightUpdateShader {
    constructor(gl) {
        this.gl = gl;
        this.program = buildProgram(gl, screenVertexSrc, heightUpdateFragmentSrc, 'Height update');
        this.positionLoc = gl.getAttribLocation(this.program, 'a_position');
        this.texCoordLoc = gl.getAttribLocation(this.program, 'a_texCoord');
        this.uHeightLoc = gl.getUniformLocation(this.program, 'u_height');
        this.uFluxLoc = gl.getUniformLocation(this.program, 'u_flux');
        this.uTexelXLoc = gl.getUniformLocation(this.program, 'u_texelX');
        this.uColumnCountLoc = gl.getUniformLocation(this.program, 'u_columnCount');
        this.uColumnAreaLoc = gl.getUniformLocation(this.program, 'u_columnArea');
        this.uDtLoc = gl.getUniformLocation(this.program, 'u_dt');
        this.uMinHeightLoc = gl.getUniformLocation(this.program, 'u_minHeight');
        this.uPourStartColLoc = gl.getUniformLocation(this.program, 'u_pourStartCol');
        this.uPourEndColLoc = gl.getUniformLocation(this.program, 'u_pourEndCol');
        this.uPourRateLoc = gl.getUniformLocation(this.program, 'u_pourRate');
    }
}
