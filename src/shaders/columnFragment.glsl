#version 300 es
precision highp float;

in vec3 v_normal;
in vec2 v_texCoord;
in float v_t;

out vec4 fragColor;
uniform vec3 u_color;
uniform float u_lit; // 1 = shade with the fixed light, 0 = flat color (outline lines)
uniform sampler2D u_texture; // satellite imagery draped over the columns via v_texCoord
uniform float u_useTexture;  // 1 = sample u_texture for the base color, 0 = use flat u_color

uniform float u_useRamp;     // 1 = color by the chosen water quantity (water fills only)
uniform vec3 u_ramp[5];

vec3 ramp(float t) {
    float x = clamp(t, 0.0, 1.0) * 4.0;
    int i = min(int(x), 3);
    return mix(u_ramp[i], u_ramp[i + 1], x - float(i));
}

void main() {
    // fixed world-space light so the boxes read as 3D without a full lighting setup
    vec3 lightDir = normalize(vec3(0.35, -0.45, 0.82));
    float diffuse = max(dot(v_normal, lightDir), 0.0);
    float shade = mix(1.0, 0.4 + 0.6 * diffuse, u_lit);
    vec3 base = mix(u_color, texture(u_texture, v_texCoord).rgb, u_useTexture);
    base = mix(base, ramp(v_t), u_useRamp);
    fragColor = vec4(base * shade, 1.0);
}
