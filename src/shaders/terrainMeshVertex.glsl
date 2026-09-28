#version 300 es

// real triangulated terrain, unlike columnVertex.glsl - positions, normals and
// texcoords come straight from MireiaTerrainMesh's CPU-built vertex buffer, nothing
// is looked up from a texture or derived from gl_InstanceID here.
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
