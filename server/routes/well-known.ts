import { Elysia } from 'elysia'
import { addAuthConfigRoutes } from '../lib/well-known/auth-config.js'
import { addDiscoveryConfigRoutes } from '../lib/well-known/discovery-config.js'
import { addPaymentsConfigRoutes } from '../lib/well-known/payments-config.js'

export function createWellKnownRouter() {
  return new Elysia()
    .use(addAuthConfigRoutes)
    .use(addDiscoveryConfigRoutes)
    .use(addPaymentsConfigRoutes)
}
