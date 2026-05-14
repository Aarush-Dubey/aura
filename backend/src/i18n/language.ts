import type { Request } from "express";

export type SupportedLanguage = 'en' | 'hi' | 'fr' | 'es' | 'it' | 'pt' | 'ja' | 'ko' | 'zh' | 'de';

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = ['en', 'hi', 'fr', 'es', 'it', 'pt', 'ja', 'ko', 'zh', 'de'];

export const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  en: 'English', hi: 'Hindi', fr: 'French', es: 'Spanish',
  it: 'Italian', pt: 'Portuguese', ja: 'Japanese', ko: 'Korean',
  zh: 'Chinese (Mandarin)', de: 'German'
};

export function getRequestLanguage(req: Request): SupportedLanguage {
  const fromBody = (req.body as any)?.language;
  const fromHeader = req.headers['accept-language']?.split(',')[0]?.split('-')[0];
  const raw = fromBody || fromHeader || 'en';
  return SUPPORTED_LANGUAGES.includes(raw as SupportedLanguage) ? raw as SupportedLanguage : 'en';
}
