import { checkRedisConnection } from '../infra/redis'
import './sendMailWorker'

await checkRedisConnection()
console.log('[workers] All workers started')