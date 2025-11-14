<script setup>
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

        // sprite: `${window.location.origin}/sprites/sprites`,

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
        // map.addLayer({
        //     id: "debug-icon",
        //     type: "symbol",
        //     source: "ets2",
        //     "source-layer": "ets2",
        //     layout: {
        //         "icon-image": "d_e45",
        //         "icon-size": 1,
        //     },
        //     minzoom: 7,
        // });

        map.addSource("country-borders", {
            type: "geojson",
            data: "/geojson/countries.geojson",
        });

        // map.addSource("ets2-water", {
        //     type: "geojson",
        //     data: "/geojson/water.geojson",
        // });

        map.addSource("ets2-footprints", {
            type: "vector",
            url: "pmtiles://ets2-footprints.pmtiles",
        });

        // map.addLayer({
        //     id: "country-borders",
        //     type: "line",
        //     source: "country-borders",
        //     paint: {
        //         "line-color": "#383f4d",
        //         "line-opacity": 0.5,
        //         "line-width": 2,
        //     },
        // });

        // map.addLayer({
        //     id: "water-fill",
        //     type: "fill",
        //     source: "ets2-water",
        //     paint: {
        //         "fill-color": "#24467b",
        //         "fill-opacity": 0.8,
        //     },
        // });

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
    });

    // try {
    //     const meta = await p.getMetadata();
    //     console.log("PMTiles metadata:", meta);
    // } catch (err) {
    //     console.warn(
    //         "Could not read PMTiles metadata (this is non-fatal).",
    //         err
    //     );
    // }

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
