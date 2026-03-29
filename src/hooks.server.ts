import { createHandler } from 'web-sentinel/hooks'

export const handle = createHandler({ log: true, preview: false, http_status: 418 })
