import en from '@messages/en.json';
import { describe, expect, it } from 'vitest';
import { t } from '@/lib/i18n/t';

describe('translation helper', () => {
  it('returns catalog messages and fills placeholders', () => {
    expect(t('nav.signOut')).toBe('Sign out');
    expect(t('app.footer', { year: 2026 })).toBe('Copyright © 2026 TripleQ AI. All rights reserved.');
  });

  it('keeps unknown placeholders visible instead of dropping them', () => {
    expect(t('nav.userMenu')).toBe('Signed in as {name}');
  });

  it('falls back to English for an unknown locale', () => {
    expect(t('nav.signOut', {}, 'fr')).toBe(en['nav.signOut']);
  });
});
