import { describe, it, expect } from 'vitest';
// simplified listener counter logic from server/routes/radio.ts
function createListenerCounter() {
    let listenerCount = 0;
    return {
        get count() { return listenerCount; },
        update(delta) {
            listenerCount = Math.max(0, listenerCount + delta);
            return { ok: true, listeners: listenerCount };
        },
        reset() { listenerCount = 0; },
    };
}
describe('radio listener counter', () => {
    it('starts at 0', () => {
        const counter = createListenerCounter();
        expect(counter.count).toBe(0);
    });
    it('increments with positive delta', () => {
        const counter = createListenerCounter();
        counter.update(1);
        expect(counter.count).toBe(1);
    });
    it('decrements with negative delta', () => {
        const counter = createListenerCounter();
        counter.update(5);
        counter.update(-1);
        expect(counter.count).toBe(4);
    });
    it('never goes below 0', () => {
        const counter = createListenerCounter();
        counter.update(-10);
        expect(counter.count).toBe(0);
    });
    it('handles multiple concurrent changes', () => {
        const counter = createListenerCounter();
        counter.update(3);
        counter.update(-1);
        counter.update(2);
        counter.update(-4);
        expect(counter.count).toBe(0);
    });
    it('returns correct response shape', () => {
        const counter = createListenerCounter();
        const result = counter.update(1);
        expect(result).toEqual({ ok: true, listeners: 1 });
    });
});
