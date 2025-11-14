<script lang="ts" setup>
import { ets2ToLeaflet } from "~/assets/utils/mapUtility";
import type { GeojsonData } from "~~/shared/types/GeoJsonTypes/GeojsonData";
import type { TelemetryData } from "~~/shared/types/Telemetry/TelemetryData";
import * as Variables from "~~/shared/variables";

const { map, initMap } = useMap();
const telemetry = ref<TelemetryData | null>(null);

let truckMarker: L.Marker | null = null;
let markers: L.Marker[] = [];
let routes: L.Polyline[] = [];

const resetMarkers = (map: L.Map) => {
    markers.forEach((marker) => map.removeLayer(marker));
    routes.forEach((route) => map.removeLayer(route));

    markers = [];
    routes = [];
};

// const clearMap = () => {
//     if (map.value) resetMarkers(map.value);
// };

onMounted(async () => {
    const { map, initMap } = useMap();
    await initMap("map"); // "map" is the div id

    // const L = (await import("leaflet")).default;
    // await import("leaflet-rotatedmarker");

    // await initMap("map");

    // const res = await fetch("/roadnetwork.geojson");
    // const data: GeojsonData = await res.json();

    // const graph = new Graph();
    // graph.buildGraph(data);

    // if (!map.value) return;

    // map.value.on("click", (e: L.LeafletMouseEvent) => {
    //     const p = map.value!.project(e.latlng, Variables.TILESET_MAX_ZOOM);
    //     console.log("map click latlng:", e.latlng, "pixel @maxZoom:", p);

    //     const clickedKey: string | null = graph.snapToGraph(
    //         e.latlng.lat,
    //         e.latlng.lng
    //     );
    //     console.log(e.latlng.lat, e.latlng.lng);
    //     if (!clickedKey) return;

    //     const node = graph.getNode(clickedKey);
    //     if (!node) return;

    //     const marker = L.marker([node.lat, node.lng]).addTo(map.value!);
    //     markers.push(marker);

    // marker.on("click", () => {
    //     map.value!.removeLayer(marker);
    //     const index = markers.indexOf(marker);
    //     markers.splice(index, 1);

    //     routes.forEach((r) => map.value!.removeLayer(r));
    //     routes.length = 0;

    //     for (let i = 1; i < markers.length; i++) {
    //         const prev = markers[i - 1];
    //         const curr = markers[i];
    //         const prevKey = graph.snapToGraph(
    //             prev!.getLatLng().lat,
    //             prev!.getLatLng().lng
    //         );
    //         const currKey = graph.snapToGraph(
    //             curr!.getLatLng().lat,
    //             curr!.getLatLng().lng
    //         );
    //         if (prevKey && currKey) {
    //             const coords = graph.dijkstra(prevKey, currKey);
    //             const polyline = L.polyline(coords, {
    //                 color: "cyan",
    //                 weight: 3,
    //             }).addTo(map.value!);
    //             routes.push(polyline);
    //         }
    //     }
    // });

    // if (markers?.length && markers.length > 1) {
    //     const lastKey = graph.snapToGraph(
    //         markers[markers.length - 2]!.getLatLng().lat,
    //         markers[markers.length - 2]!.getLatLng().lng
    //     );
    //     if (lastKey) {
    //         const routeCoords: [number, number][] = graph.dijkstra(
    //             lastKey,
    //             clickedKey
    //         );
    //         const polyline = L.polyline(routeCoords, {
    //             color: "cyan",
    //             weight: 3,
    //         }).addTo(map.value!);
    //         routes!.push(polyline);
    //     }
    // }
    // });

    // Fetch from api/telemetry
    // const fetchTelemetry = async () => {
    //     const res = await $fetch<TelemetryData>("/api/telemetry");
    //     telemetry.value = res;
    //     console.log("Telemetry updated:", telemetry.value);

    //     const truckData = telemetry.value!.truck;
    //     const gameX = truckData.placement.x;
    //     const gameZ = truckData.placement.z;
    //     const headingRad = truckData.placement.heading;
    //     const headingDeg = headingRad * (180 / Math.PI);

    //     const latLng = ets2ToLeaflet(map.value!, gameX, gameZ, {
    //         scale: Variables.ETS_SCALE,
    //         offsetX: Variables.ETS_OFFSET_X,
    //         offsetY: Variables.ETS_OFFSET_Y,
    //         invertY: Variables.ETS_INVERT_Y,
    //     });

    //     const truckIcon = L.icon({
    //         iconUrl: "/truckMarker.png",
    //         iconSize: [30, 30],
    //         iconAnchor: [20, 20],
    //     });

    //     if (!truckMarker) {
    //         truckMarker = L.marker(latLng, {
    //             icon: truckIcon,
    //             rotationAngle: headingDeg,
    //             rotationOrigin: "center center",
    //         }).addTo(map.value!);
    //     } else {
    //         truckMarker.setLatLng(latLng);
    //         (truckMarker as any).setRotationAngle(headingDeg);
    //     }
    // };

    // fetchTelemetry();
    // setInterval(fetchTelemetry, 30000);

    // console.log(telemetry.value);

    // const zoom = 9;
    // const mapPixel = map.value.project(
    //     L.latLng(-106.1484375, 136.09765625),
    //     zoom
    // );
    // console.log(mapPixel);
});
</script>

<template>
    <div id="map-wrapper">
        <div id="map"></div>
        <div id="button-wrapper">
            <input type="button" value="Clear Markers" class="bottom-btn btn" />
        </div>
    </div>
</template>

<style scoped lang="scss">
@use "~/assets/scss/scoped/map";
</style>
