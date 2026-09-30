// Adjust the clipping range to the camera's distance from the scene bounds.
function aabbDepthRange(point, min, max, forward) {
    let closestSq = 0;
    let farthestDepth = 0;
    for (let i = 0; i < 3; i++) {
        const clamped = Math.max(min[i], Math.min(max[i], point[i]));
        const dClosest = point[i] - clamped;
        closestSq += dClosest * dClosest;
    }

    for (const x of [min[0], max[0]]) {
        for (const y of [min[1], max[1]]) {
            for (const z of [min[2], max[2]]) {
                const depth = (x - point[0]) * forward[0]
                    + (y - point[1]) * forward[1]
                    + (z - point[2]) * forward[2];
                farthestDepth = Math.max(farthestDepth, depth);
            }
        }
    }
    return [Math.sqrt(closestSq), farthestDepth];
}

export function updateDynamicClipping(camera, worldWidth, maxSceneHeight, {
    minNear = 0.75,
    nearFraction = 0.5,
    farPadding = 1.2,
    minFar = 10,
} = {}) {
    const min = [0, 0, 0];
    const max = [worldWidth, worldWidth, maxSceneHeight];
    const [closest, farthestDepth] = aabbDepthRange(camera.position, min, max, camera.getForward());

    camera.near = Math.max(minNear, closest * nearFraction);
    camera.far = Math.max(minFar, farthestDepth * farPadding, camera.near + 1);
}