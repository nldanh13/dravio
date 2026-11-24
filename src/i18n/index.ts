import { createContext, useContext } from 'react';
import type { LanguageCode } from '../types/game';
import { en } from './en';
import { vi, type TranslationKey } from './vi';

const DICTS: Record<LanguageCode, Record<TranslationKey, string>> = { vi, en };

export function translate(lang: LanguageCode, key: string, params?: Record<string, string | number>): string {
  const dict = DICTS[lang];
  const raw = (dict as Record<string, string>)[key] ?? key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`));
}

export function formatNumber(lang: LanguageCode, n: number): string {
  const locale = lang === 'vi' ? 'vi-VN' : 'en-US';
  return new Intl.NumberFormat(locale, {
    notation: Math.abs(n) >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: 3,
  }).format(n);
}

export const LanguageContext = createContext<LanguageCode>('vi');

export function useTranslation() {
  const lang = useContext(LanguageContext);
  return {
    lang,
    t: (key: string, params?: Record<string, string | number>) => translate(lang, key, params),
    n: (value: number) => formatNumber(lang, value),
  };
}

export type { TranslationKey };
