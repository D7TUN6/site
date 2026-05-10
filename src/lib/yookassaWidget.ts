declare global {
  interface Window {
    YooMoneyCheckoutWidget?: new (config: unknown) => unknown
  }
}

let loaderPromise: Promise<void> | null = null

export function loadYooKassaWidgetScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('No window'))
  if (window.YooMoneyCheckoutWidget) return Promise.resolve()

  if (!loaderPromise) {
    loaderPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script')
      script.async = true
      script.defer = true
      script.src = 'https://yookassa.ru/checkout-widget/v1/checkout-widget.js'
      script.onload = () => window.YooMoneyCheckoutWidget ? resolve() : reject(new Error('YooKassa widget failed to load'))
      script.onerror = () => reject(new Error('YooKassa widget failed to load'))
      document.head.appendChild(script)
    })
  }

  return loaderPromise
}
