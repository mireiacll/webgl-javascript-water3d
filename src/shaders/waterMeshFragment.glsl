#version 300 es
precision highp float;

in vec3 v_normal;
in float v_depth;
out vec4 fragColor;
uniform vec3 u_color;

const float MIN_DRAW_DEPTH = 0.05; // same cutoff as columnVertex.glsl

void main() {
    if (v_depth < MIN_DRAW_DEPTH) discard; // dry area: let the terrain show through
    vec3 lightDir = normalize(vec3(0.35, -0.45, 0.82));
    float diffuse = max(dot(normalize(v_normal), lightDir), 0.0);
    fragColor = vec4(u_color * (0.4 + 0.6 * diffuse), 1.0);
}
