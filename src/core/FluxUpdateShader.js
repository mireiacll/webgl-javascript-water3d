import { buildProgram } from './glUtils.js';
import screenVertexSrc from '../shaders/screenVertex.glsl?raw';
import fluxUpdateFragmentSrc from '../shaders/fluxUpdateFragment.glsl?raw';

// Links the per-cell flux calculation with the shared full-screen vertex shader.
export class FluxUpdateShader {
    constructor(gl) {
        this.gl = gl;
        this.program = buildProgram(gl, screenVertexSrc, fluxUpdateFragmentSrc, 'Flux update');
        this.positionLoc = gl.getAttribLocation(this.program, 'a_position');
        this.texCoordLoc = gl.getAttribLocation(this.program, 'a_texCoord');
        this.uHeightLoc = gl.getUniformLocation(this.program, 'u_height');
        this.uFluxLoc = gl.getUniformLocation(this.program, 'u_flux');
        this.uTerrainLoc = gl.getUniformLocation(this.program, 'u_terrain');
        this.uCellAreaLoc = gl.getUniformLocation(this.program, 'u_cellArea');
        this.uEdgeOpenLoc = gl.getUniformLocation(this.program, 'u_edgeOpen');
        this.uTexelLoc = gl.getUniformLocation(this.program, 'u_texel');
        this.uColumnCountLoc = gl.getUniformLocation(this.program, 'u_columnCount');
        this.uPipeAreaLoc = gl.getUniformLocation(this.program, 'u_pipeArea');
        this.uPipeLengthLoc = gl.getUniformLocation(this.program, 'u_pipeLength');
        this.uDtLoc = gl.getUniformLocation(this.program, 'u_dt');
        this.uDampingLoc = gl.getUniformLocation(this.program, 'u_damping');
        this.uOpenBoundaryLoc = gl.getUniformLocation(this.program, 'u_openBoundary');

        for (const [key, loc] of Object.entries(this)) {
            if (key.endsWith('Loc') && (loc === null || loc === undefined || loc === -1)) {
                console.error(`FluxUpdateShader: "${key}" not found in the shader - old file or renamed uniform?`);
            }
        }
    }
}