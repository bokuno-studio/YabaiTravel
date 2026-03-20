// Simple logger compatible with Vercel Serverless Functions
export const logger = {
  info: (obj: unknown, msg?: string) => console.log(msg || '', typeof obj === 'object' ? JSON.stringify(obj) : obj),
  error: (obj: unknown, msg?: string) => console.error(msg || '', typeof obj === 'object' ? JSON.stringify(obj) : obj),
  warn: (obj: unknown, msg?: string) => console.warn(msg || '', typeof obj === 'object' ? JSON.stringify(obj) : obj),
}
