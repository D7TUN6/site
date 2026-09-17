import 'express-serve-static-core'

declare module 'express-serve-static-core' {
  interface Request {
    user: { id: number; email: string; emailVerified: boolean; role: string } | null
    isAdmin: boolean
  }
}
