export function createOrderHub() {
    const listeners = new Set();
    return {
        publish(event) {
            for (const listener of listeners) {
                try {
                    listener(event);
                }
                catch (err) {
                    console.error('OrderHub subscriber error:', err);
                }
            }
        },
        subscribe(cb) {
            listeners.add(cb);
            return () => listeners.delete(cb);
        }
    };
}
