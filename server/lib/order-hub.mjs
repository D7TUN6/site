import { EventEmitter } from "node:events";

export function createOrderHub() {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(0);

  function publish(orderId, payload) {
    if (!orderId) return;
    emitter.emit("order", { orderId: String(orderId), payload });
  }

  function subscribe(listener) {
    emitter.on("order", listener);
    return () => emitter.off("order", listener);
  }

  return {
    publish,
    subscribe
  };
}

