import express from 'express';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const ROOT = process.cwd();
const MANIFEST_PATH = path.join(ROOT, 'src', 'generated', 'release-manifest.json');
export function createReleaseRouter() {
    const router = express.Router();
    router.get('/manifest', async (_req, res) => {
        try {
            const raw = await readFile(MANIFEST_PATH, 'utf-8');
            const manifest = JSON.parse(raw);
            res.json(manifest);
        }
        catch (err) {
            console.error('Failed to read release manifest:', err);
            res.status(500).json({ error: 'Unable to read release manifest' });
        }
    });
    return router;
}
