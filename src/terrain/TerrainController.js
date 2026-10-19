import { MireiaElevationTiles } from '../geo/MireiaElevationTiles.js';
import { MireiaTileMosaic } from '../geo/MireiaTileMosaic.js';
import { fetchOsmBuildings } from '../geo/osmBuildings.js';
import {
    clampSeaLevelInPlace,
    computeBboxFromCenter,
    cropCanvasToBbox,
    cropHeightfieldToBbox,
    fillNoDataInPlace,
} from '../geo/terrainUtils.js';

const SATELLITE_IMAGERY_URL_TEMPLATE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

export class TerrainController {
    constructor({
        params,
        buildings,
        realTerrain,
        getState,
        idleState,
        getActiveWorldWidth,
        setActiveWorldWidth,
        columnCountFor,
        setBuildings,
        rebuildTerrainAndSim,
        frameCamera,
        replaceImagery,
        clearImagery,
        getUI,
        incrementTerrainSeed,
    }) {
        Object.assign(this, {
            params,
            buildings,
            realTerrain,
            getState,
            idleState,
            getActiveWorldWidth,
            setActiveWorldWidth,
            columnCountFor,
            setBuildings,
            rebuildTerrainAndSim,
            frameCamera,
            replaceImagery,
            clearImagery,
            getUI,
            incrementTerrainSeed,
        });
    }

    hasBuildingsForArea = () => this.buildings.list.length > 0 && this.buildings.areaKey === this.areaKey();

    areaKey() {
        return `${this.params.centerLat}|${this.params.centerLon}|${this.getActiveWorldWidth()}`;
    }

    async loadBuildings() {
        const { buildings, params, getActiveWorldWidth, getUI, setBuildings } = this;
        const worldWidth = getActiveWorldWidth();
        buildings.loading = true;
        buildings.error = null;
        buildings.progress = '';
        getUI().updateBuildingsStatus();
        try {
            const bbox = computeBboxFromCenter(params.centerLon, params.centerLat, worldWidth);
            const list = await fetchOsmBuildings(bbox, worldWidth, (done, total, note) => {
                buildings.progress = `${done}/${total} tiles${note ? `, ${note}` : ''}`;
                getUI().updateBuildingsStatus();
            });
            setBuildings(list);
            return true;
        } catch (err) {
            buildings.error = err.message;
            return false;
        } finally {
            buildings.loading = false;
            getUI().updateBuildingsStatus();
        }
    }

    async pullBuildings() {
        if (this.getState() !== this.idleState || this.buildings.loading) return;
        if (!(await this.loadBuildings()) || this.getState() !== this.idleState) return;
        this.params.useBuildings = true;
        this.rebuildTerrainAndSim();
        this.getUI().updateBuildingsStatus();
    }

    applyBuildings() {
        if (this.getState() !== this.idleState) return;
        this.rebuildTerrainAndSim();
        this.getUI().updateBuildingsStatus();
    }

    async loadRealTerrain() {
        const { params, realTerrain, buildings, getUI } = this;
        if (this.getState() !== this.idleState || realTerrain.loading) return;

        realTerrain.loading = true;
        realTerrain.error = null;
        getUI().updateRealTerrainStatus();

        try {
            const bbox = computeBboxFromCenter(params.centerLon, params.centerLat, params.worldWidth);
            const [raw, imagery, osmBuildings] = await Promise.all([
                MireiaElevationTiles.build(bbox),
                MireiaTileMosaic.build(bbox, { urlTemplate: SATELLITE_IMAGERY_URL_TEMPLATE }),
                params.useBuildings
                    ? fetchOsmBuildings(bbox, params.worldWidth).catch((err) => {
                        buildings.error = err.message;
                        return null;
                    })
                    : null,
            ]);

            const result = cropHeightfieldToBbox(raw, bbox);
            fillNoDataInPlace(result.heightfield, result.gridWidth, result.gridHeight);
            clampSeaLevelInPlace(result.heightfield);

            let min = Infinity;
            let max = -Infinity;
            for (const height of result.heightfield) {
                if (height < min) min = height;
                if (height > max) max = height;
            }
            const normalized = new Float32Array(result.heightfield.length);
            for (let i = 0; i < result.heightfield.length; i++) normalized[i] = result.heightfield[i] - min;

            realTerrain.heightfield = normalized;
            realTerrain.gridWidth = result.gridWidth;
            realTerrain.gridHeight = result.gridHeight;
            realTerrain.reliefMeters = max - min;

            this.replaceImagery(cropCanvasToBbox(imagery.canvas, imagery.zoom, bbox));
            params.terrainSource = 'real';
            this.setActiveWorldWidth(params.worldWidth);
            params.columnCount = this.columnCountFor(this.getActiveWorldWidth());
            if (osmBuildings) {
                buildings.error = null;
                this.setBuildings(osmBuildings);
            }
            this.rebuildTerrainAndSim();
            this.frameCamera();
            getUI().syncDropRanges();
        } catch (err) {
            realTerrain.error = err.message;
        } finally {
            realTerrain.loading = false;
            getUI().updateRealTerrainStatus();
            getUI().updateBuildingsStatus();
        }
    }

    regenerateTerrain() {
        if (this.getState() !== this.idleState) return;
        this.params.terrainSource = 'procedural';
        this.incrementTerrainSeed();
        this.setActiveWorldWidth(this.params.worldWidth);
        this.params.columnCount = this.columnCountFor(this.getActiveWorldWidth());
        this.clearImagery();
        this.rebuildTerrainAndSim();
        this.frameCamera();
        this.getUI().syncDropRanges();
    }
}