import { ScreenSpace } from './ScreenSpace.js';

export class MireiaFBO {
  #gl;
  #width;
  #height;
  #framebuffer;
  #colorBuffer;
  #depthColorBuffer; // second output: depth written as a visible color texture
  #normalBuffer;
  #selectionColorBuffer;
  #groupColorBuffer;
  #depthBuffer;

  constructor(gl, width = 512, height = 512) {
    this.#gl = gl;
    this.#width = width;
    this.#height = height;
    this.#framebuffer = null;
    this.#colorBuffer = null;
    this.#depthColorBuffer = null;
    this.#normalBuffer = null;
    this.#selectionColorBuffer = null;
    this.#groupColorBuffer = null;
    this.#depthBuffer = null;
    this.#build();
  }

  // Creates a texture and attaches it to the framebuffer at the given attachment point.
  // Used for both color outputs (COLOR_ATTACHMENT0 and COLOR_ATTACHMENT1), so the
  // texture-setup code isn't duplicated for each one.
  #createColorTexture(attachmentPoint) {
    const gl = this.#gl;

    const texture = gl.createTexture(); // new empty texture
    gl.bindTexture(gl.TEXTURE_2D, texture); // makes it current texture
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.#width, this.#height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); // allocate gpu memory
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); // blend pixels if smaller or larger than real size
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); // clamp on edge
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, attachmentPoint, gl.TEXTURE_2D, texture, 0); // use the texture as this attachment's output

    return texture;
  }

  #createDepthTexture(attachmentPoint) {
    const gl = this.#gl;

    const texture = gl.createTexture(); // new empty texture
    gl.bindTexture(gl.TEXTURE_2D, texture); // makes it current texture
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.#width, this.#height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); // allocate gpu memory
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); // blend pixels if smaller or larger than real size
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); // clamp on edge
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, attachmentPoint, gl.TEXTURE_2D, texture, 0); // use the texture as this attachment's output

    return texture;
  }

  // Creates the framebuffer plus its color textures and depth renderbuffer
  #build() {
    const gl = this.#gl;

    this.#framebuffer = gl.createFramebuffer(); // empty framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.#framebuffer); // makes tthis framebuffer the current one

    // color attachment 0: the normal rendered scene color
    this.#colorBuffer = this.#createColorTexture(gl.COLOR_ATTACHMENT0);

    // color attachment 1: depth written out as a color
    this.#depthColorBuffer = this.#createDepthTexture(gl.COLOR_ATTACHMENT1);

    // color attachment 2: surface normal written out as a color (MRT), encoded via encodeNormal
    this.#normalBuffer = this.#createDepthTexture(gl.COLOR_ATTACHMENT2);

    // color attachment 3: each object's unique picking/selection color (MRT), written as-is
    this.#selectionColorBuffer = this.#createDepthTexture(gl.COLOR_ATTACHMENT3);

    // color attachment 4: each merge-batch/group's shared color (MRT), written as-is
    this.#groupColorBuffer = this.#createDepthTexture(gl.COLOR_ATTACHMENT4);

    // tells WebGL all attachments are active outputs
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2, gl.COLOR_ATTACHMENT3, gl.COLOR_ATTACHMENT4]);

    // depth attachment
    this.#depthBuffer = gl.createRenderbuffer(); // new renderbuffer (simpler kind of storage)
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.#depthBuffer); //   scurrent buffer
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT32F, this.#width, this.#height); // allocates depth values, same wiodth/height as color texture
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.#depthBuffer); //   framebuffer has both a place to store color AND a place to store depth
    // validation
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      console.error('MireiaFBO: framebuffer incomplete, status:', status);
    }

    // clean up: unbind everything so we don't accidentally render into this by mistake
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  }

  // Call before rendering to redirect draw calls into this FBO instead of the screen.
  bind() {
    const gl = this.#gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.#framebuffer);  // redirects subsequent drawing into FBO attachment
    gl.viewport(0, 0, this.#width, this.#height); // size of drawable area
  }

  // Call after rendering to this FBO, to go back to drawing on the actual screen.
  unbind() {
    const gl = this.#gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  getFramebuffer() { return this.#framebuffer; }
  getColorBuffer() { return this.#colorBuffer; }
  getDepthColorBuffer() { return this.#depthColorBuffer; }
  getNormalBuffer() { return this.#normalBuffer; }
  getSelectionColorBuffer() { return this.#selectionColorBuffer; }
  getGroupColorBuffer() { return this.#groupColorBuffer; }
  getDepthBuffer() { return this.#depthBuffer; }

  getWidth() { return this.#width; }
  getHeight() { return this.#height; }

  // Resizing means the old GPU resources are the wrong size — delete and rebuild them.
  setSize(width, height) {
    const gl = this.#gl;
    gl.deleteFramebuffer(this.#framebuffer);
    gl.deleteTexture(this.#colorBuffer);
    gl.deleteTexture(this.#depthColorBuffer);
    gl.deleteTexture(this.#normalBuffer);
    gl.deleteTexture(this.#selectionColorBuffer);
    gl.deleteTexture(this.#groupColorBuffer);
    gl.deleteRenderbuffer(this.#depthBuffer);

    this.#width = width;
    this.#height = height;
    this.#build(); // rebuild everything
  }

  // Reads back the encoded depth at one specific pixel
  readDepthAt(x, y) {
    const gl = this.#gl;
    const pixel = new Uint8Array(4);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.#framebuffer);
    gl.readBuffer(gl.COLOR_ATTACHMENT1); // the depth-as-color attachment
    gl.readPixels(x, ScreenSpace.flipY(y, this.#height), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const r = pixel[0] / 255;
    const g = pixel[1] / 255;
    const b = pixel[2] / 255;
    const a = pixel[3] / 255;

    return r * 1.0 + g * (1 / 256) + b * (1 / (256 * 256)) + a * (1 / (256 * 256 * 256));
  }

  readSelectionColorAt(x,y){
    const gl = this.#gl;
    const pixel = new Uint8Array(4);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.#framebuffer);
    gl.readBuffer(gl.COLOR_ATTACHMENT3); // the selection-id attachment
    gl.readPixels(x, ScreenSpace.flipY(y, this.#height), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return [pixel[0], pixel[1], pixel[2]]; //rgb
  }
}