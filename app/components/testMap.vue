<script setup lang="ts">
import type { Map } from "maplibre-gl";
import { onMounted, ref } from "vue";

const mapEl = ref<HTMLElement | null>(null);
let map: Map | null = null;
onMounted(async () => {
    if (mapEl.value) {
        map = await initializeMap(mapEl.value);
    }
});
</script>

<template>
    <div ref="mapEl" style="width: 100%; height: 100vh"></div>
</template>

<style scoped lang="scss">
@use "~/assets/scss/scoped/map.scss";
</style>
