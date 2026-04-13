import { Queue } from 'bullmq';
import { getRedisConnection } from '../infra/redis';

let sendEmailsQueue = null

export function getSendEmailsQueue() {
    const connection = getRedisConnection()
    if (!sendEmailsQueue) {
        sendEmailsQueue = new Queue('send-emails', { connection });
        sendEmailsQueue.on("error", (err) => {
            console.error("Send emails queue error:", err.message);
        });
    }
    return sendEmailsQueue;
}