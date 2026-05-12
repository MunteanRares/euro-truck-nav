<script lang="ts" setup>
import {
    downloadMapData,
    isMapDownloaded,
    uninstallMapData,
} from "~/assets/utils/shared/fileManager";

const { selectedGame } = useGameSelection();
const { updateProfile, activeSettings } = useSettings();
const { isMobile } = usePlatform();
const { t } = useTranslations();

const emit = defineEmits(["connected"]);

const isDownloading = ref(false);
const downloadProgress = ref(0);
const downloadingId = ref<string | null>(null);

const isModPanelOpen = ref(false);
const isBaseDownloaded = ref(false);

onMounted(async () => {
    if (selectedGame.value) {
        isBaseDownloaded.value = await isMapDownloaded(selectedGame.value);
    }
});

// const availableMods (computed game object based on settings.selectedGame)

watch(selectedGame, async (newGame) => {
    if (newGame) {
        isBaseDownloaded.value = await isMapDownloaded(newGame);
    }
});

async function startDownload(mapId: string, zipUrl: string) {
    isDownloading.value = true;
    downloadingId.value = mapId;
    downloadProgress.value = 0;

    const success = await downloadMapData(mapId, zipUrl, (percent) => {
        downloadProgress.value = percent;
    });

    isDownloading.value = false;
    downloadingId.value = null;

    if (success && mapId === selectedGame.value) {
        isBaseDownloaded.value = true;
    }
}

function selectMod(modId: string | "none") {
    updateProfile("activeMod", modId);
    toggleModPanel();
}

function toggleModPanel() {
    isModPanelOpen.value = !isModPanelOpen.value;
}

async function uninstallMap() {
    if (!selectedGame.value) return;

    await uninstallMapData(selectedGame.value);

    setTimeout(async () => {
        const stillExists = await isMapDownloaded(selectedGame.value!);
        isBaseDownloaded.value = stillExists;
    }, 300);
}
</script>

<template>
    <section class="section-mobile-menu">
        <div class="title">
            <Icon class="icon" name="lucide:cast" size="20" />
            <span>{{ t("mobile.pairWithComputer") }}</span>
        </div>

        <div class="content">
            <div class="top-content">
                <GameSelection v-model="selectedGame" :width="150" />
                <div
                    v-if="isBaseDownloaded && selectedGame"
                    class="top-buttons"
                >
                    <button @click="toggleModPanel" class="btn nav-btn mod-btn">
                        <Icon name="lucide:settings" size="20" />
                        <span
                            >Map Mods ({{
                                activeSettings.activeMod === "none"
                                    ? "None"
                                    : activeSettings.activeMod
                            }})</span
                        >
                    </button>

                    <button
                        @click="uninstallMap"
                        class="btn nav-btn mod-btn default-color"
                    >
                        <Icon name="lucide:trash-2" size="20" />
                        <span>Uninstall Base Map</span>
                    </button>
                </div>
            </div>

            <template v-if="isBaseDownloaded && selectedGame">
                <InputComputerIP
                    v-if="isMobile"
                    @connected="emit('connected')"
                    :style="{ width: '100%', marginTop: '10px' }"
                    :require-game="true"
                />

                <button
                    v-else
                    @click.prevent="emit('connected')"
                    class="btn nav-btn success-btn"
                >
                    <span>Start Navigation</span>
                    <Icon name="lucide:map-pinned" size="20" />
                </button>
            </template>

            <template v-else-if="!isBaseDownloaded && selectedGame">
                <div class="bottom-download-button">
                    <button
                        @click.prevent="
                            startDownload(
                                selectedGame,
                                `https://trucknavapp.com/${selectedGame}.zip`,
                            )
                        "
                        class="btn nav-btn"
                        :disabled="isDownloading"
                    >
                        <span>Download Base Map</span>
                        <Icon name="lucide:download" size="20" />
                    </button>

                    <ProgressBar
                        class="progress-bar"
                        v-if="isDownloading"
                        :progress="downloadProgress"
                    />
                </div>
            </template>

            <Transition name="panel-pop">
                <PopupPanel
                    v-if="isModPanelOpen"
                    title="Select Map Mod"
                    @close="toggleModPanel"
                    >Promods</PopupPanel
                >
            </Transition>
        </div>
    </section>
</template>

<style
    scoped
    lang="scss"
    src="~/assets/scss/scoped/layouts/gameManager.scss"
></style>
