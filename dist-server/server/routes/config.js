import express from 'express';
import { getOptionalEnv } from '../lib/config.js';
import { getFeatureFlags } from '../routes/admin/site-config.js';
import { listActiveBanners } from '../routes/admin/banners.js';
let _db = null;
export function initConfigDb(db) {
    _db = db;
}
export function createConfigRouter() {
    const router = express.Router();
    router.get('/', (_req, res) => {
        const features = _db ? getFeatureFlags(_db) : {};
        const banners = {};
        if (_db) {
            for (const page of ['shop', 'music', 'main', 'donate', 'news', 'blog', 'gallery', 'video', 'radio']) {
                banners[page] = listActiveBanners(_db, page);
            }
        }
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json({
            ok: true,
            features,
            banners,
            yandexMapsApiKey: getOptionalEnv('YANDEX_MAPS_JS_API_KEY', '') || getOptionalEnv('YANDEX_MAPS_API_KEY', '') || null,
            yandexSearchEnabled: Boolean(getOptionalEnv('YANDEX_MAPS_SEARCH_API_KEY', '')),
            yookassa: {
                shopId: getOptionalEnv('YOOKASSA_SHOP_ID', '') || null,
                returnUrl: getOptionalEnv('YOOKASSA_RETURN_URL', '') || null,
            },
        });
    });
    return router;
}
