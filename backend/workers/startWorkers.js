import { checkRedisConnection } from '../infra/redis.js'
import './sendMailWorker.js'

await checkRedisConnection()
console.log('[workers] All workers started')