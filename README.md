# Water Columns (WebGL2 port)

JS/WebGL2 port of the LWJGL/OpenGL shallow-water column simulation. Same
GPU ping-pong flux/height update passes as the Java version; ImGui is
replaced by a plain HTML/CSS control panel (`index.html` / `src/style.css`).

## Setup

```
npm install
npm run dev
```

Open the printed local URL (usually `http://localhost:5173`). No other
setup is needed - Vite serves `index.html` and bundles `src/main.js` and
its imports, including the `.glsl` files (imported as raw text via the
`?raw` suffix, which is built into Vite, no plugin required).

`npm run build` produces a static `dist/` you can host anywhere; `npm run
preview` serves that build locally.

## Requirements

WebGL2 with the `EXT_color_buffer_float` extension (needed to render into
the RG32F/R32F float textures the flux/height ping-pong buffers use).
Enabled by default in current Chrome, Firefox, Edge and Safari - the app
throws a clear error on load if it's missing rather than failing silently
mid-frame.

## Structure

Mirrors the Java source file-for-file under `src/core/`, e.g.
`WaterFBO.java` -> `WaterFBO.js`, `ColumnRenderer.java` -> `ColumnRenderer.js`.
Two differences from a literal port:

- `src/core/glUtils.js` is new: it holds the shader-compile/link boilerplate
  that every `*Shader.java` class duplicated. Each `*Shader.js` class now
  just calls into it.
- `ColumnShader.java` wasn't in the uploaded files, so `ColumnShader.js` is
  reconstructed from how `ColumnRenderer.java` calls it (same uniform/attribute
  names). Worth double-checking against your original if you still have it.

`Main.java` -> `src/main.js`, with the ImGui panel replaced by the DOM
controls in `index.html`, wired up with plain event listeners.

## Known behavioral differences

- **Terrain seed -> shape**: `TerrainHeightTextureBuilder` needs a seedable
  RNG for reproducible terrain per seed. `java.util.Random`'s algorithm has
  no JS equivalent, so this uses a different seedable PRNG (mulberry32).
  Same seed will *not* reproduce the same terrain as the Java version, but
  is internally consistent (same seed -> same terrain, every time, in the JS app).
- `fluxUpdateFragment.glsl`'s old, commented-out single-channel flux
  version (wrapped in `/* ... */` in your upload) was dropped rather than
  ported - only the live two-channel version is in `src/shaders/fluxUpdateFragment.glsl`.
