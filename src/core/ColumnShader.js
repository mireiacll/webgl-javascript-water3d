import { buildProgram } from './glUtils.js';
import columnVertexSrc from '../shaders/columnVertex.glsl?raw';
import columnFragmentSrc from '../shaders/columnFragment.glsl?raw';

// Shader interface for the instanced column renderer.
export class ColumnShader {
    constructor(gl) {
        this.gl = gl;
        this.program = buildProgram(gl, columnVertexSrc, columnFragmentSrc, 'Column');
        this.cornerLoc = gl.getAttribLocation(this.program, 'a_corner');
        this.normalLoc = gl.getAttribLocation(this.program, 'a_normal');
        this.uViewProjLoc = gl.getUniformLocation(this.program, 'u_viewProj');
        this.uWaterLoc = gl.getUniformLocation(this.program, 'u_water');
        this.uTerrainLoc = gl.getUniformLocation(this.program, 'u_terrain');
        this.uColumnCountLoc = gl.getUniformLocation(this.program, 'u_columnCount');
        this.uWorldWidthLoc = gl.getUniformLocation(this.program, 'u_worldWidth');
        this.uGapFractionLoc = gl.getUniformLocation(this.program, 'u_gapFraction');
        this.uLayerLoc = gl.getUniformLocation(this.program, 'u_layer');
        this.uColorLoc = gl.getUniformLocation(this.program, 'u_color');
        this.uLitLoc = gl.getUniformLocation(this.program, 'u_lit');
        this.uTextureLoc = gl.getUniformLocation(this.program, 'u_texture');
        this.uUseTextureLoc = gl.getUniformLocation(this.program, 'u_useTexture');

        for (const [key, loc] of Object.entries(this)) {
            if (key.endsWith('Loc') && (loc === null || loc === undefined || loc === -1)) {
                console.error(`ColumnShader: "${key}" not found in the shader - old file or renamed uniform?`);
            }
        }
    }
}