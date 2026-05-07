<script lang="ts" setup>
import { darkenColor } from "~/assets/utils/shared/colors";

defineProps<{ progress: number }>();
const { activeSettings } = useSettings();
</script>

<template>
    <div class="progress-bar-bg">
        <div
            class="progress-bar-fill"
            :style="{
                width: progress + '%',
                backgroundColor: darkenColor(activeSettings.themeColor, 0.2),
            }"
        ></div>
    </div>
</template>

<style
    lang="scss"
    scoped
    src="~/assets/scss/scoped/common/progressBar.scss"
></style>
