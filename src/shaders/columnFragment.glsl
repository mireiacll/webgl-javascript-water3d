#version 300 es
precision highp float;

in vec3 v_normal;
in vec2 v_texCoord;

out vec4 fragColor;
uniform vec3 u_color;
uniform float u_lit; // 1 = shade with the fixed light, 0 = flat color (outline lines)
uniform sampler2D u_texture; // satellite imagery draped over the columns via v_texCoord
uniform float u_useTexture;  // 1 = sample u_texture for the base color, 0 = use flat u_color

void main() {
    // fixed world-space light so the boxes read as 3D without a full lighting setup
    vec3 lightDir = normalize(vec3(0.35, -0.45, 0.82));
    float diffuse = max(dot(v_normal, lightDir), 0.0);
    float shade = mix(1.0, 0.4 + 0.6 * diffuse, u_lit);
    vec3 base = mix(u_color, texture(u_texture, v_texCoord).rgb, u_useTexture);
    fragColor = vec4(base * shade, 1.0);
}
