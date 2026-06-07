import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../lib/password.js';
describe('hashPassword', () => {
    it('returns a string in scrypt format', () => {
        const hash = hashPassword('password123');
        expect(typeof hash).toBe('string');
        expect(hash.startsWith('scrypt$')).toBe(true);
        const parts = hash.split('$');
        expect(parts).toHaveLength(6);
        expect(parts[0]).toBe('scrypt');
        expect(Number(parts[1])).toBe(16384);
        expect(Number(parts[2])).toBe(8);
        expect(Number(parts[3])).toBe(1);
        expect(parts[4]).toMatch(/^[0-9a-f]{32}$/);
        expect(parts[5]).toMatch(/^[0-9a-f]{128}$/);
    });
    it('produces different hashes for same password', () => {
        const hash1 = hashPassword('password123');
        const hash2 = hashPassword('password123');
        expect(hash1).not.toBe(hash2);
    });
    it('throws for short passwords', () => {
        expect(() => hashPassword('short')).toThrow('Password too short');
    });
    it('throws for empty string', () => {
        expect(() => hashPassword('')).toThrow('Password too short');
    });
    it('throws for non-string input', () => {
        expect(() => hashPassword(123)).toThrow('Password too short');
    });
});
describe('verifyPassword', () => {
    it('verifies correct password', () => {
        const hash = hashPassword('mySecurePass123');
        expect(verifyPassword('mySecurePass123', hash)).toBe(true);
    });
    it('rejects incorrect password', () => {
        const hash = hashPassword('mySecurePass123');
        expect(verifyPassword('wrongPassword', hash)).toBe(false);
    });
    it('returns false for non-string password', () => {
        expect(verifyPassword(123, 'scrypt$16384$8$1$salt$hash')).toBe(false);
    });
    it('returns false for non-string stored', () => {
        expect(verifyPassword('pass', 123)).toBe(false);
    });
    it('returns false for malformed stored hash (wrong parts)', () => {
        expect(verifyPassword('pass', 'scrypt$16384$8$1$salt')).toBe(false);
    });
    it('returns false for malformed stored hash (wrong prefix)', () => {
        expect(verifyPassword('pass', 'bcrypt$10$salt$hash$extra$part')).toBe(false);
    });
    it('returns false for empty stored hash', () => {
        expect(verifyPassword('pass', '')).toBe(false);
    });
});
