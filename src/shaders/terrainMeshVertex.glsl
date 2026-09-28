#version 300 es

// Attributes come from the CPU-built mesh rather than per-column texture lookups.
in vec3 a_position;
in vec3 a_normal;
in vec2 a_texCoord;

uniform mat4 u_viewProj;

out vec3 v_normal;
out vec2 v_texCoord;

void main() {
    gl_Position = u_viewProj * vec4(a_position, 1.0);
    v_normal = a_normal;
    v_texCoord = a_texCoord;
}
