import { getLanguage } from 'obsidian';
import { SupportedLanguage, LanguageInfo, TranslationDict } from './types';
import { de } from './locales/de';
import { en } from './locales/en';
import { zh } from './locales/zh';
import { hi } from './locales/hi';
import { es } from './locales/es';
import { fr } from './locales/fr';
import { ar } from './locales/ar';
import { bn } from './locales/bn';
import { pt } from './locales/pt';
import { ru } from './locales/ru';
import { ur } from './locales/ur';
import { ckb } from './locales/ckb';
import { kmr } from './locales/kmr';
import { sdh } from './locales/sdh';

export * from './types';

const TRANSLATIONS: Record<string, TranslationDict> = {
	de,
	en,
	zh,
	hi,
	es,
	fr,
	ar,
	bn,
	pt,
	ru,
	ur,
	ckb,
	kmr,
	sdh,
};

export const SUPPORTED_LANGUAGES: LanguageInfo[] = [
	{ code: 'auto', name: 'Auto', nativeName: 'Automatisch / Auto' },
	{ code: 'de', name: 'German', nativeName: 'Deutsch' },
	{ code: 'en', name: 'English', nativeName: 'English' },
	{ code: 'zh', name: 'Chinese', nativeName: '中文 (Mandarin)' },
	{ code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
	{ code: 'es', name: 'Spanish', nativeName: 'Español' },
	{ code: 'fr', name: 'French', nativeName: 'Français' },
	{ code: 'ar', name: 'Arabic', nativeName: 'العربية', rtl: true },
	{ code: 'bn', name: 'Bengali', nativeName: 'বাংলা' },
	{ code: 'pt', name: 'Portuguese', nativeName: 'Português' },
	{ code: 'ru', name: 'Russian', nativeName: 'Русский' },
	{ code: 'ur', name: 'Urdu', nativeName: 'اردو', rtl: true },
	{ code: 'ckb', name: 'Kurdish (Sorani)', nativeName: 'کوردی - سۆرانی', rtl: true },
	{ code: 'kmr', name: 'Kurdish (Kurmanji)', nativeName: 'Kurdî - Kurmancî' },
	{ code: 'sdh', name: 'Kurdish (Southern / Kelhuri)', nativeName: 'کوردی - کەڵهوڕی', rtl: true },
];

let currentLanguageSetting: SupportedLanguage = 'auto';
let effectiveLanguage: SupportedLanguage = 'en';

export function detectLanguage(): SupportedLanguage {
	try {
		// 1. Obsidian stored language
		const obsidianLang = getLanguage();
		if (obsidianLang) {
			const lower = obsidianLang.toLowerCase();
			if (lower.startsWith('de')) return 'de';
			if (lower.startsWith('zh')) return 'zh';
			if (lower.startsWith('hi')) return 'hi';
			if (lower.startsWith('es')) return 'es';
			if (lower.startsWith('fr')) return 'fr';
			if (lower.startsWith('ar')) return 'ar';
			if (lower.startsWith('bn')) return 'bn';
			if (lower.startsWith('pt')) return 'pt';
			if (lower.startsWith('ru')) return 'ru';
			if (lower.startsWith('ur')) return 'ur';
			if (lower.startsWith('sdh')) return 'sdh';
			if (lower.startsWith('ckb') || lower.startsWith('ku-arab')) return 'ckb';
			if (lower.startsWith('kmr') || lower.startsWith('ku')) return 'kmr';
			if (lower.startsWith('en')) return 'en';
		}

		// 2. Browser / OS language
		const navLang = (navigator.language || '').toLowerCase();
		if (navLang.startsWith('de')) return 'de';
		if (navLang.startsWith('zh')) return 'zh';
		if (navLang.startsWith('hi')) return 'hi';
		if (navLang.startsWith('es')) return 'es';
		if (navLang.startsWith('fr')) return 'fr';
		if (navLang.startsWith('ar')) return 'ar';
		if (navLang.startsWith('bn')) return 'bn';
		if (navLang.startsWith('pt')) return 'pt';
		if (navLang.startsWith('ru')) return 'ru';
		if (navLang.startsWith('ur')) return 'ur';
		if (navLang.startsWith('sdh')) return 'sdh';
		if (navLang.startsWith('ckb') || navLang.startsWith('ku-arab')) return 'ckb';
		if (navLang.startsWith('kmr') || navLang.startsWith('ku')) return 'kmr';
	} catch {
		// Fallback
	}

	return 'en';
}

export function setLanguage(lang: string | undefined): void {
	if (!lang || lang === 'auto') {
		currentLanguageSetting = 'auto';
		effectiveLanguage = detectLanguage();
	} else if (lang in TRANSLATIONS) {
		currentLanguageSetting = lang as SupportedLanguage;
		effectiveLanguage = lang as SupportedLanguage;
	} else {
		currentLanguageSetting = 'auto';
		effectiveLanguage = detectLanguage();
	}
}

export function getLanguageSetting(): SupportedLanguage {
	return currentLanguageSetting;
}

export function getEffectiveLanguage(): SupportedLanguage {
	return effectiveLanguage;
}

export function isRtl(): boolean {
	const info = SUPPORTED_LANGUAGES.find((l) => l.code === effectiveLanguage);
	return info?.rtl ?? false;
}

export function t(key: keyof TranslationDict): string {
	const currentDict = TRANSLATIONS[effectiveLanguage];
	if (currentDict && key in currentDict) {
		return currentDict[key];
	}

	// Fallback to German or English
	if (TRANSLATIONS.de && key in TRANSLATIONS.de) {
		return TRANSLATIONS.de[key];
	}

	if (TRANSLATIONS.en && key in TRANSLATIONS.en) {
		return TRANSLATIONS.en[key];
	}

	return key;
}
