import { describe, it, expect } from 'vitest'
import { formatShopMoney } from '@/lib/money'

describe('formatShopMoney', () => {
  it('formats RUB in Russian locale', () => {
    const result = formatShopMoney({ currency: 'RUB', value: 1300 }, 'ru')
    expect(result).toContain('1')
    expect(result).toContain('300')
  })

  it('formats RUB in English locale', () => {
    const result = formatShopMoney({ currency: 'RUB', value: 1300 }, 'en')
    expect(result).toContain('1')
    expect(result).toContain('300')
  })

  it('formats zero', () => {
    const result = formatShopMoney({ currency: 'RUB', value: 0 }, 'en')
    expect(result).toContain('0')
  })

  it('formats large values', () => {
    const result = formatShopMoney({ currency: 'RUB', value: 100000 }, 'en')
    expect(result).toContain('100')
  })

  it('handles unknown currency with fallback', () => {
    const result = formatShopMoney({ currency: 'USD' as 'RUB', value: 500 }, 'en')
    expect(result).toContain('500')
  })
})
