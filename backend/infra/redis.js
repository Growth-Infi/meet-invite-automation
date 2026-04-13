import IORedis from 'ioredis';
// import ApiError from '../utils/apiError';

// for production:
const REDIS_URL = process.env.REDIS_URL || `redis://localhost:6379`
// if (!REDIS_URL) throw new ApiError(400, "Provide Redis connection") 

let connection = null

export async function checkRedisConnection() {
    if (!connection) connection = new IORedis(`${REDIS_URL}`, {
        maxRetriesPerRequest: null
    });
    try {
        await connection.ping()
        console.log('[redis] Connection verified')
    } catch (err) {
        console.error('[redis] Could not connect:', err)
    }
    return connection;
}

export function getRedisConnection() {
    if (!connection) {
        connection = new IORedis(`${REDIS_URL}`, {
            maxRetriesPerRequest: null
        });

        connection.on('error', (err) => {
            console.error('[redis] Connection error:', err.message)
        })

        connection.on('connect', () => {
            console.log('[redis] Connected')
        })
    }
    return connection;
}
