import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * AD-13 acceptance test 16 — "No Firestore access is possible from the browser (the rules
 * deny it)." This checks the DEPLOYED CONFIGURATION shape (the rules file itself, and that
 * firebase.json actually wires it up), not live enforcement — proving a security rule actually
 * holds against a real Firestore instance needs the Firebase emulator or a live project, neither
 * of which this test environment has. A release step should still run
 * `firebase deploy --only firestore:rules` and, ideally, an emulator-backed rules test before
 * the family model goes live with real data.
 */
describe('AD-13 acceptance 16 — Firestore security rules deny all client access', () => {
  it('firestore.rules denies read and write for every document', () => {
    const rules = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');
    expect(rules).toMatch(/match \/\{document=\*\*\}/);
    expect(rules).toMatch(/allow read, write: if false;/);
  });

  it('firebase.json actually references firestore.rules/firestore.indexes.json', () => {
    const config = JSON.parse(readFileSync(resolve(process.cwd(), 'firebase.json'), 'utf8'));
    expect(config.firestore?.rules).toBe('firestore.rules');
    expect(config.firestore?.indexes).toBe('firestore.indexes.json');
  });
});
