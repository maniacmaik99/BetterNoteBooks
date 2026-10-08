import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
	t,
	setLanguage,
	getLanguageSetting,
	getEffectiveLanguage,
	SUPPORTED_LANGUAGES,
	isRtl,
} from '../src/i18n';

describe('i18n Module', () => {
	it('provides translations and tracks effective language', () => {
		setLanguage('de');
		assert.equal(getLanguageSetting(), 'de');
		assert.equal(getEffectiveLanguage(), 'de');
		assert.equal(t('toolbar_pen'), 'Stift (Pen)');

		setLanguage('en');
		assert.equal(getLanguageSetting(), 'en');
		assert.equal(getEffectiveLanguage(), 'en');
		assert.equal(t('toolbar_pen'), 'Pen');
	});

	it('falls back when a key is accessed', () => {
		setLanguage('en');
		const enVal = t('sidebar_page');
		assert.ok(enVal.length > 0);
	});

	it('detects RTL languages properly', () => {
		setLanguage('ar');
		assert.equal(isRtl(), true);

		setLanguage('de');
		assert.equal(isRtl(), false);
	});

	it('provides supported languages list', () => {
		assert.ok(SUPPORTED_LANGUAGES.length >= 2);
		const codes = SUPPORTED_LANGUAGES.map((l) => l.code);
		assert.ok(codes.includes('de'));
		assert.ok(codes.includes('en'));
	});
});
