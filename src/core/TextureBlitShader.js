import { buildProgram } from './glUtils.js';
import screenVertexSrc from '../shaders/screenVertex.glsl?raw';
import screenFragmentSrc from '../shaders/screenFragment.glsl?raw';

export class TextureBlitShader {
    constructor(gl) {
        this.gl = gl;
        this.program = buildProgram(gl, screenVertexSrc, screenFragmentSrc, 'Screen');
        this.positionLoc = gl.getAttribLocation(this.program, 'a_position');
        this.texCoordLoc = gl.getAttribLocation(this.program, 'a_texCoord');
        this.textureLoc = gl.getUniformLocation(this.program, 'u_texture');
    }
}
