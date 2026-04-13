import { getSendEmailsQueue } from "./queues";

//payload :
// {
//     campaign_id: "uuid",
//     recipient_id: "uuid",     
//     gmail_account_id: "uuid",
//     recipient_email: "...",
//     meet_link: "...",
//     template: { subject, body } //maybe
// }

export async function enqueueSendEmailsQueue(payload) {
    const queue = getSendEmailsQueue();
    await queue.add('send-emails',
        payload,
        {
            jobId: `${payload.account_id}-${payload.recipient_email}-${Date.now()}`,
            attempts: 3,
            backoff: {
                delay: 2000,
                type: "exponential"
            },
            removeOnFail: false,
            removeOnComplete: true,
        }
    )
    console.log('[send-emails] Enqueued')
}

