import express from 'express';
import { enforceSameOrigin } from '../../lib/request-origin.js';
import { requireEnv } from '../../lib/config.js';
import { getCookie } from '../../lib/cookies.js';
import { ADMIN_SESSION_COOKIE, clearAdminSessionCookie, createAdminSession, revokeAdminSession, setAdminSessionCookie } from '../../lib/sessions.js';
import { checkLoginRateLimit, normalizeEmail, safeEqual } from './shared.js';
export function createAdminAuthRouter({ db }) {
    const router = express.Router();
    router.get('/me', (req, res) => res.status(200).json({
        ok: true,
        isAdmin: Boolean(req.isAdmin),
        email: req.isAdmin ? normalizeEmail(requireEnv('ADMIN_EMAIL')) : null,
    }));
    router.post('/logout', enforceSameOrigin, (req, res) => {
        const token = getCookie(req, ADMIN_SESSION_COOKIE);
        if (token)
            revokeAdminSession(db, token);
        clearAdminSessionCookie(res);
        return res.status(200).json({ ok: true });
    });
    router.post('/login', /*enforceSameOrigin,*/ (req, res) => {
        try {
            console.debug('login handler body:', JSON.stringify(req.body));
            const ip = req.ip || 'unknown';
            if (!checkLoginRateLimit(`admin-login:${ip}`)) {
                console.debug('rate limited');
                return res.status(429).json({ error: 'Too many requests' });
            }
            const email = normalizeEmail(req.body?.email);
            const password = typeof req.body?.password === 'string' ? req.body.password : '';
            console.debug('login parsed:', JSON.stringify({ email, password: password ? '***' : '' }));
            const adminEmail = normalizeEmail(requireEnv('ADMIN_EMAIL'));
            const adminPassword = requireEnv('ADMIN_PASSWORD');
            console.debug('admin credentials loaded:', JSON.stringify({ adminEmail, adminPassword: adminPassword ? '***' : '' }));
            if (!email || !password)
                return res.status(400).json({ error: 'Invalid credentials' });
            if (!safeEqual(email, adminEmail) || !safeEqual(password, adminPassword))
                return res.status(401).json({ error: 'Invalid credentials' });
            const session = createAdminSession(db, { ip: req.ip, userAgent: String(req.get('user-agent') || '') });
            setAdminSessionCookie(res, session.token);
            return res.status(200).json({ ok: true });
        }
        catch (err) {
            console.debug('login handler error:', err);
            return res.status(500).json({ error: String(err) });
        }
    });
    return router;
}
