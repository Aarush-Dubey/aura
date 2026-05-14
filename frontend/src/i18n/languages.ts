export type SupportedLanguage = 'en' | 'hi' | 'fr' | 'es' | 'it' | 'pt' | 'ja' | 'ko' | 'zh' | 'de';

export const LANGUAGES: readonly { code: SupportedLanguage; nativeName: string }[] = [
  { code: 'en', nativeName: 'English' },
  { code: 'hi', nativeName: 'हिन्दी' },
  { code: 'fr', nativeName: 'Français' },
  { code: 'es', nativeName: 'Español' },
  { code: 'it', nativeName: 'Italiano' },
  { code: 'pt', nativeName: 'Português' },
  { code: 'ja', nativeName: '日本語' },
  { code: 'ko', nativeName: '한국어' },
  { code: 'zh', nativeName: '中文' },
  { code: 'de', nativeName: 'Deutsch' },
];

export const SUPPORTED_CODES = LANGUAGES.map(l => l.code);
