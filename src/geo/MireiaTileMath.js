export const MireiaTileMath = {

    lonLatToTile(lon,lat,zoom){ // slippy map projection
        const n = Math.pow(2,zoom);
        const x = Math.floor((lon+180)/360*n);
        const latRad = (lat*Math.PI)/180;
        const y = Math.floor((1-Math.log(Math.tan(latRad)+1 / Math.cos(latRad))/Math.PI)/2*n);
        return {x,y};
    },

    tileToLonLat(x,y,zoom){
        const n = Math.pow(2, zoom);
        const lon = (x / n) * 360 - 180;
        const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
        const lat = (latRad * 180) / Math.PI;
        return { lon, lat };
    },

     chooseZoomForBbox(bbox, maxTilesPerSide = 8) {
        for (let zoom = 18; zoom >= 1; zoom--) {
            const nw = this.lonLatToTile(bbox.getMinX(), bbox.getMaxY(), zoom);
            const se = this.lonLatToTile(bbox.getMaxX(), bbox.getMinY(), zoom);
            const tilesX = se.x - nw.x + 1;
            const tilesY = se.y - nw.y + 1;
            if (tilesX <= maxTilesPerSide && tilesY <= maxTilesPerSide) {
                return zoom;
            }
        }
        return 1;
    },

    tilesForBbox(bbox, zoom) {
        const nw = this.lonLatToTile(bbox.getMinX(), bbox.getMaxY(), zoom);
        const se = this.lonLatToTile(bbox.getMaxX(), bbox.getMinY(), zoom);
        const tiles = [];
        for (let x = nw.x; x <= se.x; x++) {
            for (let y = nw.y; y <= se.y; y++) {
                tiles.push({ x, y, zoom });
            }
        }
        return tiles;
    },
}