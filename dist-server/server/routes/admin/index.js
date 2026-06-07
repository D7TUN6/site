import express from 'express';
import { requireAdmin } from '../../middleware/require-auth.js';
import { getOptionalEnv } from '../../lib/config.js';
import { createAdminAuthRouter } from './auth.js';
import { createAdminOrdersRouter } from './orders.js';
import { createAdminReleasesRouter } from './releases.js';
import { createAdminShopRouter } from './shop.js';
import { createAdminGalleryRouter } from './gallery.js';
import { createAdminVideoRouter } from './video.js';
import { createAdminRadioRouter } from './radio.js';
import { createAdminSiteConfigRouter, getFeatureFlags } from './site-config.js';
import { createAdminBannersRouter } from './banners.js';
import { createAdminUsersRouter } from './users.js';
export function createAdminRouter({ db, manifestPath }) {
    const router = express.Router();
    console.error('ADMIN ROUTER INITIALIZED');
    router.use('/', createAdminAuthRouter({ db }));
    router.use('/orders', createAdminOrdersRouter({ db }));
    router.use('/releases', createAdminReleasesRouter());
    router.use('/shop', createAdminShopRouter({ db }));
    router.use('/gallery', createAdminGalleryRouter());
    router.use('/video', createAdminVideoRouter());
    router.use('/radio', createAdminRadioRouter({ manifestPath }));
    router.use('/site-config', createAdminSiteConfigRouter({ db }));
    router.use('/banners', createAdminBannersRouter({ db }));
    router.use('/users', createAdminUsersRouter({ db }));
    router.get('/config', requireAdmin, (_req, res) => {
        const features = getFeatureFlags(db);
        return res.status(200).json({
            ok: true,
            features: { ...features, trackingAutoUpdate: Boolean(getOptionalEnv('CDEK_CLIENT_ID', '') || getOptionalEnv('RUSSIAN_POST_TOKEN', '')) }
        });
    });
    return router;
}
