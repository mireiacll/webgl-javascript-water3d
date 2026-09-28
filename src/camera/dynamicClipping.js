// Adjust the clipping range to the camera's distance from the scene bounds.
function aabbDistanceRange(point, min, max) {
    let closestSq = 0;
    let farthestSq = 0;
    for (let i = 0; i < 3; i++) {
        const clamped = Math.max(min[i], Math.min(max[i], point[i]));
        const dClosest = point[i] - clamped;
        closestSq += dClosest * dClosest;

        const dMin = point[i] - min[i];
        const dMax = point[i] - max[i];
        farthestSq += Math.max(dMin * dMin, dMax * dMax);
    }
    return [Math.sqrt(closestSq), Math.sqrt(farthestSq)];
}

export function updateDynamicClipping(camera, worldWidth, maxSceneHeight, {
    minNear = 0.05,
    nearFraction = 0.5,
    farPadding = 1.2,
    minFar = 10,
} = {}) {
    const min = [0, 0, 0];
    const max = [worldWidth, worldWidth, maxSceneHeight];
    const [closest, farthest] = aabbDistanceRange(camera.position, min, max);

    camera.near = Math.max(minNear, closest * nearFraction);
    camera.far = Math.max(minFar, farthest * farPadding, camera.near + 1);
}