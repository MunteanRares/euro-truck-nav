import de from "~/locales/de.json";
import en from "~/locales/en.json";
import nl from "~/locales/nl.json";
import cs from "~/locales/cs.json";
import sk from "~/locales/sk.json";
import ro from "~/locales/ro.json";
import ko from "~/locales/ko.json";
import zh from "~/locales/zh.json";

type TranslationTree = typeof en;

const dictionaries: Record<LocaleCode, TranslationTree> = {
    en,
    de,
    nl,
    cs,
    sk,
    ro,
    ko,
    zh,
};

function readValue(tree: TranslationTree, path: string): string | undefined {
    return path.split(".").reduce<unknown>((current, segment) => {
        if (current && typeof current === "object" && segment in current) {
            return (current as Record<string, unknown>)[segment];
        }

        return undefined;
    }, tree) as string | undefined;
}

export const useTranslations = () => {
    const { settings, updateGlobal } = useSettings();

    const locale = computed(() => settings.value.locale);

    const setLocale = (nextLocale: LocaleCode) => {
        updateGlobal("locale", nextLocale);
    };

    const t = (path: string) => {
        const currentDict = dictionaries[locale.value] || dictionaries.en;
        return (
            readValue(currentDict, path) ??
            readValue(dictionaries.en, path) ??
            path
        );
    };

    return {
        locale,
        setLocale,
        t,
    };
};
