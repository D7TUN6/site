import { getFeatureFlags } from '../routes/admin/site-config.js';
let _db = null;
export function initFeatureToggle(db) {
    _db = db;
}
export function requireFeature(feature) {
    return (req, res, next) => {
        if (!_db)
            return next();
        const flags = getFeatureFlags(_db);
        if (flags[feature] === false) {
            return res.status(503).json({ error: 'This section is currently disabled for maintenance' });
        }
        next();
    };
}
