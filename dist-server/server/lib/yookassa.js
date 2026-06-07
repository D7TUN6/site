import crypto from 'node:crypto';
import { requireEnv } from './config.js';
const API_BASE = 'https://api.yookassa.ru';
function authHeader() {
    const shopId = requireEnv('YOOKASSA_SHOP_ID');
    const secretKey = requireEnv('YOOKASSA_SECRET_KEY');
    return `Basic ${Buffer.from(`${shopId}:${secretKey}`).toString('base64')}`;
}
export function minorToYooKassaValue(minor) {
    const safe = Number.isFinite(minor) ? Math.floor(minor) : 0;
    const rub = Math.floor(safe / 100);
    const kop = Math.abs(safe % 100);
    return `${rub}.${String(kop).padStart(2, '0')}`;
}
export async function createEmbeddedPayment({ amountMinor, currency = 'RUB', description, metadata }) {
    const response = await fetch(`${API_BASE}/v3/payments`, {
        method: 'POST',
        headers: {
            Authorization: authHeader(),
            'Content-Type': 'application/json',
            'Idempotence-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({
            amount: { value: minorToYooKassaValue(amountMinor), currency },
            capture: true,
            confirmation: { type: 'embedded' },
            description,
            metadata,
        }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok)
        throw new Error(String(payload?.description || 'Unable to create payment'));
    if (!payload?.confirmation?.confirmation_token)
        throw new Error('Missing confirmation_token from YooKassa');
    return { paymentId: payload.id, status: payload.status, confirmationToken: payload.confirmation.confirmation_token };
}
export async function fetchPayment(paymentId) {
    const response = await fetch(`${API_BASE}/v3/payments/${encodeURIComponent(paymentId)}`, {
        method: 'GET',
        headers: { Authorization: authHeader() },
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok)
        throw new Error(String(payload?.description || 'Unable to fetch payment'));
    return payload;
}
