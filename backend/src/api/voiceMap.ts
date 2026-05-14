import type { SupportedLanguage } from "../i18n/language.js";

export const KOKORO_VOICES: Partial<Record<SupportedLanguage, string>> = {
  en: "af_heart",
  hi: "hi_alpha",
  fr: "ff_siwis",
  es: "es_alpha",
  it: "it_alpha",
  pt: "pt_alpha",
  ja: "ja_alpha",
  ko: "ko_alpha",
  zh: "zh_alpha",
};

export const MACOS_SAY_VOICES: Record<SupportedLanguage, string> = {
  en: "Samantha",
  hi: "Lekha",
  fr: "Thomas",
  es: "Monica",
  it: "Alice",
  pt: "Luciana",
  ja: "Kyoko",
  ko: "Yuna",
  zh: "Ting-Ting",
  de: "Anna",
};

export function getKokoroVoice(language: SupportedLanguage): string | null {
  return KOKORO_VOICES[language] ?? null;
}

export function getMacosSayVoice(language: SupportedLanguage): string {
  return MACOS_SAY_VOICES[language] ?? "Samantha";
}
