import { VERTEX_SHADER_SOURCE } from '../shaders/vertex.glsl.js';
import { FRAGMENT_SHADER_SOURCE } from '../shaders/fragment.glsl.js';

export class Shader {
  #gl;
  #program;
  #positionLoc;
  #colorLoc;
  #texCoordLoc;
  #normalLoc;
  #matrixLoc;
  #modelViewMatrixLoc;
  #textureLoc;
  #useTextureLoc;
  #lightDirectionLoc;
  #ambientStrengthLoc;
  #useLightingLoc;
  #objectTMatrixLoc;
  #nearLoc;
  #farLoc;
  #pickColorLoc;
  #pickIdLoc;
  #selectedPickIdLoc;
  #groupColorLoc;

  constructor(gl) {
    this.#gl = gl;
    this.#program = this.#buildProgram();
    this.#positionLoc = gl.getAttribLocation(this.#program, 'a_position');
    this.#colorLoc = gl.getAttribLocation(this.#program, 'a_color');
    this.#texCoordLoc = gl.getAttribLocation(this.#program, 'a_texCoord');
    this.#normalLoc = gl.getAttribLocation(this.#program, 'a_normal');
    this.#matrixLoc = gl.getUniformLocation(this.#program, 'u_matrix');
    this.#modelViewMatrixLoc = gl.getUniformLocation(this.#program, 'u_modelViewMatrix');
    this.#textureLoc = gl.getUniformLocation(this.#program, 'u_texture');
    this.#useTextureLoc = gl.getUniformLocation(this.#program, 'u_useTexture');
    this.#lightDirectionLoc = gl.getUniformLocation(this.#program, 'u_lightDirection');
    this.#ambientStrengthLoc = gl.getUniformLocation(this.#program, 'u_ambientStrength');
    this.#useLightingLoc = gl.getUniformLocation(this.#program, 'u_useLighting');
    this.#objectTMatrixLoc = gl.getUniformLocation(this.#program, 'u_objectTMatrix');
    this.#nearLoc = gl.getUniformLocation(this.#program, 'u_near');
    this.#farLoc = gl.getUniformLocation(this.#program, 'u_far');
    this.#pickColorLoc = gl.getAttribLocation(this.#program, 'a_pickColor');
    this.#pickIdLoc = gl.getAttribLocation(this.#program, 'a_pickId');
    this.#selectedPickIdLoc = gl.getUniformLocation(this.#program, 'u_selectedPickId');
    this.#groupColorLoc = gl.getAttribLocation(this.#program, 'a_groupColor');
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
    const vs = this.#compile(gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
    const fs = this.#compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);

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
  getColorLoc() { return this.#colorLoc; }
  getTexCoordLoc() { return this.#texCoordLoc; }
  getNormalLoc() { return this.#normalLoc; }
  getMatrixLoc() { return this.#matrixLoc; }
  getModelViewMatrixLoc() { return this.#modelViewMatrixLoc; }
  getTextureLoc() { return this.#textureLoc; }
  getUseTextureLoc() { return this.#useTextureLoc; }
  getLightDirectionLoc() { return this.#lightDirectionLoc; }
  getAmbientStrengthLoc() { return this.#ambientStrengthLoc; }
  getUseLightingLoc() { return this.#useLightingLoc; }
  getObjectTMatrixLoc() { return this.#objectTMatrixLoc; }
  getNearLoc() { return this.#nearLoc; }
  getFarLoc() { return this.#farLoc; }
  getPickColorLoc() { return this.#pickColorLoc; }
  getPickIdLoc() { return this.#pickIdLoc; }
  getSelectedPickIdLoc() { return this.#selectedPickIdLoc; }
  getGroupColorLoc() { return this.#groupColorLoc; }
}