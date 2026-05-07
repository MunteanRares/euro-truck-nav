<script lang="ts" setup>
import { darkenColor } from "~/assets/utils/shared/colors";
import ProgressBar from "./progressBar.vue";

defineProps<{ progress: number }>();
const { activeSettings } = useSettings();
const { t } = useTranslations();
</script>

<template>
    <div class="loading-screen">
        <div
            class="progress-text"
            :style="{
                color: darkenColor(activeSettings.themeColor, 0.2),
            }"
        >
            {{ progress }}%
        </div>
        <ProgressBar :progress="progress" />
        <h2 class="loading-text">{{ t("common.loadingRouteData") }}</h2>
    </div>
</template>

<style
    lang="scss"
    scoped
    src="~/assets/scss/scoped/common/loadingScreen.scss"
></style>
