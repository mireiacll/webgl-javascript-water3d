export class Texture {
  #gl;
  #texture;
  #loaded;
  #repeat;

  constructor(gl, source, { repeat = false } = {}) {
    this.#gl = gl;
    this.#loaded = false;
    this.#repeat = repeat;
    this.#texture = this.#createPlaceholder();
    //this.#loadImage(url);
    if (typeof source === 'string') {
      this.#loadImage(source);           // existing URL path
    } else {
      this.#loadFromElement(source);     // canvas or already-loaded Image/ImageBitmap
    }
  }

  #createPlaceholder() {
    const gl = this.#gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([160, 160, 160, 255]));
    return texture;
  }

  #uploadAndConfigure(element) {
    const gl = this.#gl;
    gl.bindTexture(gl.TEXTURE_2D, this.#texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, element);

    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    const wrap = this.#repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);

    // sharpens further at grazing angles specifically — the exact case that was blurry
    const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    if (aniso) {
      const maxAniso = gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
      gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, maxAniso));
    }

    this.#loaded = true;
  }

  #loadImage(url) {
    const image = new Image();
    image.onload = () => this.#uploadAndConfigure(image);
    image.src = url;
  }

  #loadFromElement(element) {
    this.#uploadAndConfigure(element);
  }

  getTexture() { return this.#texture; }
  isLoaded() { return this.#loaded; }
}