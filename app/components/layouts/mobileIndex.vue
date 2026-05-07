<script lang="ts" setup>
import {
    downloadMapData,
    isMapDownloaded,
    uninstallMapData,
} from "~/assets/utils/shared/fileManager";

const { selectedGame } = useGameSelection();
const { updateProfile, activeSettings } = useSettings();
const { t } = useTranslations();

const emit = defineEmits(["connected"]);

const isDownloading = ref(false);
const downloadProgress = ref(0);
const downloadingId = ref<string | null>(null);

const isModPanelOpen = ref(false);
const isBaseDownloaded = ref(false);

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
    await uninstallMapData(selectedGame.value!);
    isBaseDownloaded.value = await isMapDownloaded(selectedGame.value!);
}
</script>

<template>
    <section class="section-mobile-menu">
        <div class="title">
            <Icon class="icon" name="lucide:cast" size="20" />
            <span>{{ t("mobile.pairWithComputer") }}</span>
        </div>

        <div class="content">
            <GameSelection v-model="selectedGame" :width="150" />

            <template v-if="!isBaseDownloaded && selectedGame">
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

            <template v-else>
                <div class="top-buttons">
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

                    <button @click="uninstallMap" class="btn nav-btn mod-btn">
                        <Icon name="lucide:trash-2" size="20" />
                        <span>Uninstall Base Game</span>
                    </button>
                </div>

                <InputComputerIP
                    @connected="emit('connected')"
                    :style="{ width: '100%', marginTop: '10px' }"
                    :require-game="true"
                />
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
    src="~/assets/scss/scoped/layouts/mobileIndex.scss"
></style>
