import { buildProgram } from './glUtils.js';
import screenVertexSrc from '../shaders/screenVertex.glsl?raw'; // reused as-is
import fluxUpdateFragmentSrc from '../shaders/fluxUpdateFragment.glsl?raw';

export class FluxUpdateShader {
    constructor(gl) {
        this.gl = gl;
        this.program = buildProgram(gl, screenVertexSrc, fluxUpdateFragmentSrc, 'Flux update');
        this.positionLoc = gl.getAttribLocation(this.program, 'a_position');
        this.texCoordLoc = gl.getAttribLocation(this.program, 'a_texCoord');
        this.uHeightLoc = gl.getUniformLocation(this.program, 'u_height');
        this.uFluxLoc = gl.getUniformLocation(this.program, 'u_flux');
        this.uTerrainLoc = gl.getUniformLocation(this.program, 'u_terrain');
        this.uTexelXLoc = gl.getUniformLocation(this.program, 'u_texelX');
        this.uColumnCountLoc = gl.getUniformLocation(this.program, 'u_columnCount');
        this.uPipeAreaLoc = gl.getUniformLocation(this.program, 'u_pipeArea');
        this.uPipeLengthLoc = gl.getUniformLocation(this.program, 'u_pipeLength');
        this.uDtLoc = gl.getUniformLocation(this.program, 'u_dt');
        this.uDampingLoc = gl.getUniformLocation(this.program, 'u_damping');
    }
}
