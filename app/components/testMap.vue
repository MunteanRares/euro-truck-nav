<template>
    <ClientOnly>
        <div ref="mapEl" style="width: 100%; height: 100vh"></div>
    </ClientOnly>
</template>

<script setup>
// Nuxt 3 page that loads a PMTiles archive with MapLibre GL in the browser.
// Instructions:
// 1) Install deps: npm i maplibre-gl pmtiles
// 2) Place your .pmtiles file in the project's "public" directory as /ets2.pmtiles
// 3) Run the dev server: npm run dev
// 4) Open this page in the browser (e.g. /map or /)

import { onMounted, ref } from "vue";
const mapEl = ref(null);

onMounted(async () => {
    // avoid running on server
    if (typeof window === "undefined") return;

    // dynamic imports so this file is SSR-safe
    const maplibregl = (await import("maplibre-gl")).default;
    // pmtiles exports Protocol and PMTiles classes
    const pmtiles = await import("pmtiles");
    const { Protocol, PMTiles } = pmtiles;

    // Create a protocol instance and register it with maplibre
    const protocol = new Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);

    // Point this at the file you placed in /public
    const PMTILES_URL = "/ets2.pmtiles";

    // Create a PMTiles instance and register with the protocol so maplibre can request tiles
    const p = new PMTiles(PMTILES_URL);
    protocol.add(p);

    // Basic style that references the PMTiles source. This will not add any vector layers
    // (layer names depend on how the pmtiles file was produced). Use the browser console
    // to inspect available "source-layers" and then add layers that reference them.
    const style = {
        version: 8,
        name: "ETS2 PMTiles (local)",
        sources: {
            ets2: {
                type: "vector",
                // You can reference the pmtiles file using the pmtiles:// protocol scheme.
                // MapLibre + the protocol above will resolve this.
                url: `pmtiles://${PMTILES_URL}`,
            },
        },
        // Start with a plain background so the map renders without errors even before
        // you add vector layers from the pmtiles source.
        layers: [
            {
                id: "background",
                type: "background",
                paint: { "background-color": "#f2f2f2" },
            },
            {
                id: "ets2-lines",
                type: "line",
                source: "ets2",
                "source-layer": "ets2", // use this exact ID from vector_layers
                paint: {
                    "line-color": "#ff0000",
                    "line-width": 1,
                },
            },
        ],
    };

    const map = new maplibregl.Map({
        container: mapEl.value,
        style,
        center: [10, 50], // adjust to your area
        zoom: 4,
    });

    // Optional: once the PMTiles instance is ready, log metadata so you can see what
    // source-layer names are available and add layers accordingly.
    try {
        const meta = await p.getMetadata();
        console.log("PMTiles metadata:", meta);
        // meta.tilejson or meta.extensions may contain useful info depending on how file was generated
    } catch (err) {
        console.warn(
            "Could not read PMTiles metadata (this is non-fatal).",
            err
        );
    }

    // Add controls
    map.addControl(new maplibregl.NavigationControl());
    map.addControl(new maplibregl.FullscreenControl());
});
</script>

<style scoped>
/* make sure the map container stretches to full height */
:root,
html,
body,
#__nuxt,
.nuxt-root {
    height: 100%;
}
</style>
