#version 300 es
precision highp float;

in vec3 v_normal;
in float v_depth;
in float v_t;
out vec4 fragColor;
uniform vec3 u_color;
uniform float u_useRamp;   // 1 = color by the chosen quantity, 0 = flat u_color
uniform vec3 u_ramp[5];

const float MIN_DRAW_DEPTH = 0.05; // same cutoff as columnVertex.glsl

vec3 ramp(float t) {
    float x = clamp(t, 0.0, 1.0) * 4.0;
    int i = min(int(x), 3);
    return mix(u_ramp[i], u_ramp[i + 1], x - float(i));
}

void main() {
    if (v_depth < MIN_DRAW_DEPTH) discard; // dry area: let the terrain show through
    vec3 lightDir = normalize(vec3(0.35, -0.45, 0.82));
    float diffuse = max(dot(normalize(v_normal), lightDir), 0.0);
    vec3 base = mix(u_color, ramp(v_t), u_useRamp);
    fragColor = vec4(base * (0.4 + 0.6 * diffuse), 1.0);
}
