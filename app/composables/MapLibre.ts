import type { Map as MapLibreGl, StyleSpecification } from "maplibre-gl";
import {
    blendWithBg,
    darkenColor,
    lightenColor,
} from "~/assets/utils/shared/colors";
import { BlobSource } from "~/assets/utils/shared/BlobSource";
import { getMapFileUrl } from "~/assets/utils/shared/fileManager";

export async function initializeMap(
    container: HTMLElement,
): Promise<MapLibreGl> {
    const { settings, activeSettings } = useSettings();

    const baseUrl = window.location.origin;

    const maplibregl = (await import("maplibre-gl")).default;
    const { Protocol, PMTiles } = await import("pmtiles");

    const protocol = new Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);

    async function loadPmtiles(fileName: string, key: string) {
        const game = settings.value.selectedGame!;
        const url = await getMapFileUrl(game, `map-data/tiles/${fileName}.mp3`);

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to load ${fileName}`);

            const blob = await response.blob();
            const pmtilesInstance = new PMTiles(new BlobSource(blob, key));
            protocol.add(pmtilesInstance);

            console.log(
                `Successfully loaded ${fileName} into memory (${(
                    blob.size /
                    1024 /
                    1024
                ).toFixed(2)} MB)`,
            );
        } catch (error) {
            console.error("Error loading PMTiles blob:", error);
        }
    }

    await Promise.all([
        loadPmtiles("roads", "roads"),
        loadPmtiles("map-data-combined", "all-data"),
    ]);

    const style: StyleSpecification = {
        version: 8,

        name: "PMTiles (local)",
        sources: {
            [`${settings.value.selectedGame}`]: {
                type: "vector",
                url: `pmtiles://roads`,
            },
        },

        sprite: `${baseUrl}/sprites/${settings.value.selectedGame}/sprites`,
        glyphs: `${baseUrl}/glyphs/{fontstack}/{range}.pbf`,

        layers: [
            {
                id: "background",
                type: "background",
                paint: {
                    "background-color":
                        activeSettings.value.backgroundColor ?? "#24467b",
                },
            },
            {
                id: "lines",
                type: "line",
                source: `${settings.value.selectedGame}`,
                "source-layer": `${settings.value.selectedGame}`,
                paint: {
                    "line-color": "#3d546e",
                    "line-width": 2,
                },
            },
        ],
    };

    const gameMap = {
        ets: {
            container,
            style,
            center: [0, 0],
            zoom: 6,
            minZoom: 5,
            maxZoom: 13,
            maxPitch: 60,
            fadeDuration: 0,
            attributionControl: false,
            collectResourceTiming: false,
            maxBounds: [
                [-30, -23], // [[west, south]
                [23, 25], // [east, north]]
            ],
        },

        ats: {
            container,
            style,
            center: [0, 0],
            zoom: 6,
            minZoom: 5,
            maxZoom: 13,
            maxPitch: 60,
            fadeDuration: 0,
            attributionControl: false,
            collectResourceTiming: false,
            maxBounds: [
                [-30, -23], // [[west, south]
                [23, 25], // [east, north]]
            ],
        },
    };

    const selectedMap =
        settings.value.selectedGame === "ets2" ? gameMap.ets : gameMap.ats;
    const map = new maplibregl.Map(selectedMap as maplibregl.MapOptions);

    map.on("error", (e) => {
        console.error(">>> MAP ERROR EVENT:", e);
        if (e.error) {
            console.error("   Message:", e.error.message);
            console.error("   Stack:", e.error.stack);
        }
        // @ts-ignore
        if (e.sourceId) console.error("  Failing Source:", e.sourceId);
        // @ts-ignore
        if (e.tile) console.error("  Failing Tile:", e.tile);
    });

    //// =================> LATER ATS UPDATE <=================

    map.on("load", async () => {
        map.addSource("all-data", {
            type: "vector",
            url: "pmtiles://all-data",
        });

        // WATER
        map.addLayer({
            id: "water",
            type: "fill",
            source: "all-data",
            "source-layer": "water",
            paint: {
                "fill-color": activeSettings.value?.landColor ?? "#272d39",
            },
        });

        // DISPLAYING COUNTRY DELIMITATIONS
        map.addLayer({
            id: "country-borders",
            type: "fill",
            source: "all-data",
            "source-layer": "countries",
            paint: {
                "fill-color": activeSettings.value?.landColor
                    ? darkenColor(activeSettings.value.landColor, 0.4)
                    : "#3d546e",
                "fill-opacity": 0.4,
            },
        });

        ////
        //// LAYERS FOR DISPLAYING
        //// FROM SOURCES
        ////
        // OUTLINE
        map.addLayer({
            id: "water-outline",
            type: "line",
            source: "all-data",
            "source-layer": "water",
            paint: {
                "line-color": activeSettings.value?.landColor
                    ? darkenColor(activeSettings.value.landColor, 0.15)
                    : "#1e3a5f",
                "line-width": [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    5,
                    2.5,
                    10,
                    5,
                ],
                "line-opacity": 0.7,
            },
        });

        // THICK ROADS
        map.addLayer({
            id: "roads",
            type: "line",
            source: `${settings.value.selectedGame}`,
            "source-layer": `${settings.value.selectedGame}`,
            layout: {
                "line-join": ["step", ["zoom"], "miter", 8, "round"],
                "line-cap": ["step", ["zoom"], "butt", 8, "round"],
            },
            paint: {
                "line-color": activeSettings.value?.roadColor
                    ? activeSettings.value.roadColor
                    : "#4a5f7a",
                "line-width": [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    5,
                    0.5,
                    9,
                    2,
                    10,
                    6,
                    11,
                    9,
                ],
                "line-opacity": 1,
            },
        });

        // POLYGONS FOR PARKING ETC
        map.addLayer(
            {
                id: "maparea-zones",
                type: "fill",
                source: "all-data",
                "source-layer": "mapareas",
                paint: {
                    "fill-color": [
                        "match",
                        ["get", "color"],
                        0,
                        "#3d546e",
                        1,
                        "#4a5f7a",
                        2,
                        "#556b7f",
                        3,
                        "#6b7f93",
                        4,
                        "#7d93a7",
                        "#3d546e",
                    ],
                    "fill-opacity": 0.5,
                },
            },
            "lines",
        );

        // PREFABS FOR SERVICE AREAS     ETC
        const color0 = blendWithBg(
            lightenColor(activeSettings.value.themeColor, 0.3),
            0.6,
        );
        const color1 = blendWithBg(
            lightenColor(activeSettings.value.themeColor, 0),
            0.6,
        );
        map.addLayer(
            {
                id: "prefab-zones",
                type: "fill",
                source: "all-data",
                "source-layer": "prefabs",
                paint: {
                    "fill-color": [
                        "match",
                        ["get", "color"],
                        0,
                        color0,
                        1,
                        color0,
                        2,
                        color1,
                        3,
                        color0,
                        "#3d546e",
                    ],
                },
                minzoom: 8,
            },
            "roads",
        );

        // DISPLAYING VILLAGE NAMES
        map.addLayer({
            id: "village-labels",
            type: "symbol",
            source: "all-data",
            "source-layer": "ets2villages",
            layout: {
                "text-field": ["get", "name"],
                "text-font": [
                    activeSettings.value.fontFamily || "Commissioner",
                ],
                "text-size": 13,
                "text-anchor": "center",
                "text-offset": [0, 0],
                "text-allow-overlap": true,
                "text-ignore-placement": true,
            },
            paint: {
                "text-color": "#ffffff",
            },
            minzoom: 8.2,
        });

        // DISPLAYING STATE DELIMITATIONS
        map.addLayer(
            {
                id: "state-borders",
                type: "line",
                source: "all-data",
                "source-layer": "states",
                paint: {
                    "line-color": "#3d546e",
                    "line-width": 2,
                    "line-opacity": 0.4,
                },
            },
            "lines",
        );

        // ALL SPRITE SHEETS
        map.addLayer({
            id: "all-sprites",
            type: "symbol",
            source: "all-data",
            "source-layer": "spritelocations",
            filter: ["!=", ["get", "poiType"], "road"],
            minzoom: 8,
            layout: {
                "icon-image": ["get", "sprite"],
                "icon-size": [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    7,
                    1,
                    10,
                    1.5,
                    12,
                    2,
                ],
                "icon-allow-overlap": false,
                "symbol-sort-key": [
                    "match",
                    ["get", "sprite"],
                    "gas_ico",
                    1,
                    "service_ico",
                    2,
                    10,
                ],
                "symbol-placement": "point",
            },
        });

        // ROAD POI TYPE
        map.addLayer({
            id: "road-sprites",
            type: "symbol",
            source: "all-data",
            "source-layer": "spritelocations",
            filter: ["==", ["get", "poiType"], "road"],
            minzoom: 8,
            layout: {
                "icon-image": ["get", "sprite"],
                "icon-size": [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    7,
                    0.6,
                    10,
                    0.9,
                ],
                "icon-allow-overlap": true,
                "symbol-placement": "point",
            },
        });

        // DISPLAYING CITY NAMES
        map.addLayer({
            id: "city-labels",
            type: "symbol",
            source: "all-data",
            "source-layer": "cities",
            filter: ["!=", ["get", "capital"], 2],
            layout: {
                "text-field": ["get", "name"],
                "text-font": [
                    activeSettings.value.fontFamily || "Commissioner",
                ],
                "text-size": 15,
                "text-anchor": "bottom",
                "text-offset": [0, -0.3],
                "text-allow-overlap": true,
                "text-ignore-placement": true,
            },
            paint: {
                "text-color": "#ffffff",

                "text-halo-color": "#ffffff",
                "text-halo-width": 0.3,
            },
            minzoom: 6,
            maxzoom: 8,
        });

        // DISPLAYING CAPITAL NAMES
        map.addLayer({
            id: "capital-major-labels",
            type: "symbol",
            filter: ["==", ["get", "capital"], 2],
            source: "all-data",
            "source-layer": "cities",
            layout: {
                "text-field": ["get", "name"],
                "text-size": 18,
                "text-font": [
                    activeSettings.value.fontFamily || "Commissioner",
                ],
                "text-anchor": "bottom",
                "text-offset": [0, -0.3],
                "text-allow-overlap": true,
                "text-ignore-placement": true,
            },
            paint: {
                "text-color": "#ffffff",
                "text-halo-color": "#ffffff",
            },

            minzoom: 6,
            maxzoom: 8,
        });

        // DISPLAYING COUNTRY NAMES
        map.addLayer({
            id: "country-labels",
            type: "symbol",
            source: "all-data",
            "source-layer": "countrynames",
            layout: {
                "text-field": ["get", "name"],
                "text-size": 20,
                "text-font": [
                    activeSettings.value.fontFamily || "Commissioner",
                ],
                "text-anchor": "bottom",
                "text-offset": [0, -0.3],
                "text-allow-overlap": true,
                "text-ignore-placement": true,
            },
            paint: {
                "text-color": "#ffffff",
                "text-halo-color": "#ffffff",
                "text-halo-width": 0.5,
            },
            minzoom: 5,
            maxzoom: 6,
        });
    });

    return map;
}
