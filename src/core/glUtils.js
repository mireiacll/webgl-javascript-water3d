export function compileShader(gl, type, source, label) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(`${label} shader compilation failed: ${gl.getShaderInfoLog(shader)}`);
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

export function buildProgram(gl, vertexSource, fragmentSource, label) {
    const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource, label);
    const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource, label);
    if (!vertexShader || !fragmentShader) return null;

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error(`${label} program linking failed: ${gl.getProgramInfoLog(program)}`);
    }
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    return program;
}
