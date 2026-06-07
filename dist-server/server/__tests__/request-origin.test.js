import { describe, it, expect, vi } from 'vitest';
import { enforceSameOrigin } from '../lib/request-origin.js';
function mockReq(overrides = {}) {
    const req = {
        get: vi.fn((name) => {
            const headers = {
                'x-forwarded-proto': 'https',
                'host': 'example.com',
                'origin': 'https://example.com',
                'referer': '',
                'x-requested-with': '',
                ...(overrides.headers || {}),
            };
            return headers[name.toLowerCase()] || '';
        }),
        protocol: 'https',
        ...overrides,
    };
    return req;
}
function mockRes() {
    const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
    };
    return res;
}
describe('enforceSameOrigin', () => {
    it('allows same-origin requests', () => {
        const req = mockReq();
        const res = mockRes();
        const next = vi.fn();
        enforceSameOrigin(req, res, next);
        expect(next).toHaveBeenCalled();
    });
    it('blocks cross-site requests via sec-fetch-site when origin mismatches', () => {
        const req = mockReq({ headers: { 'sec-fetch-site': 'cross-site', 'origin': 'https://attacker.org' } });
        const res = mockRes();
        const next = vi.fn();
        enforceSameOrigin(req, res, next);
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
    });
    it('allows "none" sec-fetch-site (direct navigation)', () => {
        const req = mockReq({ headers: { 'sec-fetch-site': 'none' } });
        const res = mockRes();
        const next = vi.fn();
        enforceSameOrigin(req, res, next);
        expect(next).toHaveBeenCalled();
    });
    it('blocks when expected origin cannot be determined', () => {
        const req = mockReq({ headers: { 'host': '', 'x-forwarded-proto': '' }, protocol: '' });
        const res = mockRes();
        const next = vi.fn();
        enforceSameOrigin(req, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
    });
    it('allows request with X-Requested-With: fetch when no origin header', () => {
        const req = mockReq({ headers: { 'origin': '', 'x-requested-with': 'fetch' } });
        const res = mockRes();
        const next = vi.fn();
        enforceSameOrigin(req, res, next);
        expect(next).toHaveBeenCalled();
    });
    it('blocks cross-origin requests from different hosts', () => {
        const req = mockReq({ headers: { 'origin': 'https://evil.com' } });
        const res = mockRes();
        const next = vi.fn();
        enforceSameOrigin(req, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
    });
    it('blocks when source origin differs from expected', () => {
        const req = mockReq({ headers: { 'host': 'example.com', 'origin': 'https://attacker.org' } });
        const res = mockRes();
        const next = vi.fn();
        enforceSameOrigin(req, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
    });
});
