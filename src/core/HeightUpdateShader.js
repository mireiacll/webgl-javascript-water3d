import { buildProgram } from './glUtils.js';
import screenVertexSrc from '../shaders/screenVertex.glsl?raw';
import heightUpdateFragmentSrc from '../shaders/heightUpdateFragment.glsl?raw';

// Links the water-state update pass; uniforms match HeightUpdateRenderer.render().
export class HeightUpdateShader {
    constructor(gl) {
        this.gl = gl;
        this.program = buildProgram(gl, screenVertexSrc, heightUpdateFragmentSrc, 'Height update');
        this.positionLoc = gl.getAttribLocation(this.program, 'a_position');
        this.texCoordLoc = gl.getAttribLocation(this.program, 'a_texCoord');
        this.uHeightLoc = gl.getUniformLocation(this.program, 'u_height');
        this.uFluxLoc = gl.getUniformLocation(this.program, 'u_flux');
        this.uCellAreaLoc = gl.getUniformLocation(this.program, 'u_cellArea');
        this.uTexelLoc = gl.getUniformLocation(this.program, 'u_texel');
        this.uColumnCountLoc = gl.getUniformLocation(this.program, 'u_columnCount');
        this.uColumnAreaLoc = gl.getUniformLocation(this.program, 'u_columnArea');
        this.uDtLoc = gl.getUniformLocation(this.program, 'u_dt');
        this.uMinHeightLoc = gl.getUniformLocation(this.program, 'u_minHeight');
        this.uPourStartLoc = gl.getUniformLocation(this.program, 'u_pourStart');
        this.uPourEndLoc = gl.getUniformLocation(this.program, 'u_pourEnd');
        this.uPourRateLoc = gl.getUniformLocation(this.program, 'u_pourRate');

        for (const [key, loc] of Object.entries(this)) {
            if (key.endsWith('Loc') && (loc === null || loc === undefined || loc === -1)) {
                console.error(`HeightUpdateShader: "${key}" not found in the shader - old file or renamed uniform?`);
            }
        }
    }
}