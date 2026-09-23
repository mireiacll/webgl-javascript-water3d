import { SCREEN_VERTEX_SHADER_SOURCE } from '../shaders/screenVertex.glsl.js';
import { SCREEN_FRAGMENT_SHADER_SOURCE } from '../shaders/screenFragment.glsl.js';

export class ScreenShader {
  #gl;
  #program;
  #positionLoc;
  #texCoordLoc;
  #textureLoc;
  #isDepthModeLoc;
  #normalTextureLoc;
  #depthTextureLoc;
  #texelSizeLoc;

  constructor(gl) {
    this.#gl = gl;
    this.#program = this.#buildProgram();
    this.#positionLoc = gl.getAttribLocation(this.#program, 'a_position');
    this.#texCoordLoc = gl.getAttribLocation(this.#program, 'a_texCoord');
    this.#textureLoc = gl.getUniformLocation(this.#program, 'u_texture');
    this.#isDepthModeLoc = gl.getUniformLocation(this.#program, 'u_isDepthMode');
    this.#normalTextureLoc = gl.getUniformLocation(this.#program, 'u_normalTexture');
    this.#depthTextureLoc = gl.getUniformLocation(this.#program, 'u_depthTexture');
    this.#texelSizeLoc = gl.getUniformLocation(this.#program, 'u_texelSize');
}

  #compile(type, source) {
    const gl = this.#gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(shader));
    }
    return shader;
  }

  #buildProgram() {
    const gl = this.#gl;
    const vs = this.#compile(gl.VERTEX_SHADER, SCREEN_VERTEX_SHADER_SOURCE);
    const fs = this.#compile(gl.FRAGMENT_SHADER, SCREEN_FRAGMENT_SHADER_SOURCE);

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(program));
    }
    return program;
  }

  getProgram() { return this.#program; }
  getPositionLoc() { return this.#positionLoc; }
  getTexCoordLoc() { return this.#texCoordLoc; }
  getTextureLoc() { return this.#textureLoc; }
  getIsDepthModeLoc() { return this.#isDepthModeLoc; }
  getNormalTextureLoc() { return this.#normalTextureLoc; }
  getDepthTextureLoc() { return this.#depthTextureLoc; }
  getTexelSizeLoc() { return this.#texelSizeLoc; }
}