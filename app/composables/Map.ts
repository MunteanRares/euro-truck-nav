import { ref, onMounted } from "vue";
import maplibregl from "maplibre-gl";
import * as pmtiles from "pmtiles";

export const useMap = () => {
    const map = ref<maplibregl.Map>();

    const initMap = async (mapId: string) => {
        // Add PMTiles protocol
        const protocol = new pmtiles.Protocol();
        maplibregl.addProtocol("pmtiles", protocol.tile.bind(protocol));

        // Initialize MapLibre map
        map.value = new maplibregl.Map({
            container: mapId,
            style: {
                version: 8,
                sources: {
                    tileset: {
                        type: "vector",
                        url: "pmtiles://ets2.pmtiles",
                    },
                },
                layers: [
                    {
                        id: "tileset-layer",
                        type: "line",
                        source: "tileset",
                        "source-layer": "ets2",
                        paint: {
                            "line-color": "#888888",
                            "line-width": 1.5,
                        },
                    },
                ],
            },
            center: [0, 0], // simple default center
            zoom: 4,
            minZoom: 4,
            maxZoom: 13,
        });
    };

    return { map, initMap };
};
