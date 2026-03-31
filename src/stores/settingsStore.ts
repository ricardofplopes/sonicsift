import { create } from "zustand";
import type { ProcessingSettings } from "@/types";

const DEFAULT_SETTINGS: ProcessingSettings = {
  silenceThresholdDb: -35,
  minSilenceDuration: 1.0,
  keptPaddingMs: 200,
  enhancementStrength: 0.5,
  outputFormat: "wav",
};

interface SettingsStore {
  settings: ProcessingSettings;
  updateSetting: <K extends keyof ProcessingSettings>(
    key: K,
    value: ProcessingSettings[K],
  ) => void;
  resetDefaults: () => void;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  settings: { ...DEFAULT_SETTINGS },

  updateSetting: (key, value) =>
    set((state) => ({
      settings: { ...state.settings, [key]: value },
    })),

  resetDefaults: () => set({ settings: { ...DEFAULT_SETTINGS } }),
}));
