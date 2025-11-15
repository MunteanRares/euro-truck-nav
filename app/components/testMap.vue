<script setup>
import { center } from "@turf/turf";
import { onMounted, ref } from "vue";
const mapEl = ref(null);

onMounted(async () => {
    const turf = await import("@turf/turf");
    const maplibregl = (await import("maplibre-gl")).default;
    const pmtiles = await import("pmtiles");
    const { Protocol, PMTiles } = pmtiles;

    const protocol = new Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);

    const PMTILES_URL = "/ets2.pmtiles";

    const p = new PMTiles(PMTILES_URL);
    protocol.add(p);

    const style = {
        version: 8,

        name: "ETS2 PMTiles (local)",
        sources: {
            ets2: {
                type: "vector",

                url: `pmtiles://${PMTILES_URL}`,
            },
        },

        layers: [
            {
                id: "background",
                type: "background",
                paint: { "background-color": "#272d39" },
            },
            {
                id: "ets2-lines",
                type: "line",
                source: "ets2",
                "source-layer": "ets2",
                paint: {
                    "line-color": "#3d546e",
                    "line-width": 2,
                },
            },
        ],
    };

    const map = new maplibregl.Map({
        container: mapEl.value,
        style,
        center: [10, 50],
        zoom: 4,
        minZoom: 5,
    });

    map.on("load", () => {
        // ADDING WATER BORDERS
        const firstLayerId = map.getStyle().layers[1].id;
        map.addSource("ets2-water", {
            type: "geojson",
            data: "geojson/modified-water.geojson",
        });

        map.addLayer(
            {
                id: "ets2-water",
                type: "fill",
                source: "ets2-water",
                paint: {
                    "fill-color": "#24467b",
                    "fill-opacity": 0.5,
                },
            },
            firstLayerId
        );
        // ROAD CASING (dark outline for depth)
        map.addLayer({
            id: "ets2-road-casing",
            type: "line",
            source: "ets2",
            "source-layer": "ets2",
            filter: ["==", ["get", "type"], "road"],
            paint: {
                "line-color": "#1a1f2a",
                "line-width": [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    5,
                    1,
                    8,
                    3,
                    12,
                    10,
                    16,
                    16,
                ],
                "line-opacity": 0.9,
            },
        });

        // THICK ROADS
        map.addLayer({
            id: "ets2-roads",
            type: "line",
            source: "ets2",
            "source-layer": "ets2",
            filter: ["==", ["get", "type"], "road"],
            paint: {
                "line-color": "#4a5f7a",
                "line-width": [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    5,
                    0.5,
                    8,
                    2,
                    12,
                    5,
                    16,
                    12,
                ],
                "line-opacity": 0.95,
            },
        });

        // POLYGONS FOR PARKING ETC
        map.addLayer(
            {
                id: "maparea-zones",
                type: "fill",
                source: "ets2",
                "source-layer": "ets2",
                filter: ["==", ["get", "type"], "mapArea"],
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
            "ets2-lines"
        );

        // FOOTPRINTS (BUILDINGS AND STUFF)
        map.addSource("ets2-footprints", {
            type: "vector",
            url: "pmtiles://ets2-footprints.pmtiles",
        });

        map.addLayer({
            id: "footprints-fill",
            type: "fill",
            source: "ets2-footprints",
            "source-layer": "footprints",
            paint: {
                "fill-color": "#2e3f52",
                "fill-opacity": 0.4,
            },
        });

        // VILLAGE LABELS
        map.addSource("ets2-villages", {
            type: "geojson",
            data: "/geojson/ets2-villages.geojson",
        });

        map.addLayer({
            id: "village-labels",
            type: "symbol",
            source: "ets2-villages",
            layout: {
                "text-field": ["get", "name"],
                "text-font": ["Quicksand"],
                "text-size": 13,
                "text-anchor": "center",
                "text-offset": [0, 0],
            },
            paint: {
                "text-color": "#ffffff",
                "text-halo-color": "#000000",
                "text-halo-width": 1,
                "text-halo-blur": 0.5,
            },
            minzoom: 7,
        });

        // CITY LABELS
        map.addLayer({
            id: "city-labels",
            type: "symbol",
            source: "ets2",
            "source-layer": "ets2",
            filter: ["==", ["get", "type"], "city"],
            layout: {
                "text-field": ["get", "name"],
                "text-font": ["Quicksand"],
                "text-size": 15,
                "text-anchor": "center",
            },
            paint: {
                "text-color": "#ffffff",
                "text-halo-color": "#000000",
                "text-halo-width": 2,
            },
            minzoom: 6,
        });

        // CAPITAL POINTS
        map.addLayer({
            id: "capital-major-labels",
            type: "symbol",
            filter: ["==", ["get", "capital"], 2],
            source: "ets2",
            "source-layer": "ets2",
            layout: {
                "text-field": ["get", "name"],
                "text-size": 18,
                "text-font": ["Quicksand"],
                "text-anchor": "center",
            },
            paint: {
                "text-color": "#ffffff",
                "text-halo-color": "#000000",
                "text-halo-width": 2,
            },
            minzoom: 4,
        });

        // COUNTRY DELIMITATION
        map.addSource("country-borders", {
            type: "geojson",
            data: "/geojson/countries.geojson",
        });

        map.addLayer({
            id: "country-borders",
            type: "line",
            source: "country-borders",
            paint: {
                "line-color": "#3d546e",
                "line-width": 5,
                "line-blur": 2,
                "line-opacity": 0.4,
            },
        });
    });

    map.addControl(new maplibregl.NavigationControl());
    map.addControl(new maplibregl.FullscreenControl());
});
</script>

<template>
    <ClientOnly>
        <div ref="mapEl" style="width: 100%; height: 100vh"></div>
    </ClientOnly>
</template>

<style scoped>
:root,
html,
body,
#__nuxt,
.nuxt-root {
    height: 100%;
}
</style>
