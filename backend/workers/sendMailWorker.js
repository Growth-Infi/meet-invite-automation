import { Worker } from 'bullmq';
import { getRedisConnection } from '../infra/redis';
import { supabase } from '../lib/supabase';
import { google } from 'googleapis'

const connection = getRedisConnection();

const worker = new Worker(
    'send-emails',
    async (job) => {
        const { batch_id } = job.data;

        console.log(`[send-emails-worker] Sending email to ${recipient_email}`);

        try {
            const { data: batch } = await supabase
                .from('email_batches')
                .select('gmail_account_id, campaign_id')
                .eq('id', batch_id)
                .single()
            const { data: account } = await supabase.from('gmail_accounts')
                .select('access_token, refresh_token, expiry_date, email')
                .eq('id', batch.gmail_account_id)
                .single()
            const { data: campaign } = await supabase
                .from('campaigns')
                .select('meet_link, template')
                .eq('id', batch.campaign_id)
                .single()
            const { data: recipients } = await supabase
                .from('recipients')
                .select('id, email')
                .eq('assigned_gmail_account_id', batch.gmail_account_id)
                .eq('campaign_id', batch.campaign_id)
                .eq('status', 'pending')

            if (!recipients || recipients.length === 0) {
                console.log(`[send-emails-worker] No pending recipients for batch ${batch_id}`)
                return
            }

            let accessToken = account.access_token
            const isExpired = Date.now() > account.expiry_date
            if (isExpired) {
                const response = await fetch('https://oauth2.googleapis.com/token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                        client_id: process.env.GOOGLE_CLIENT_ID,
                        client_secret: process.env.GOOGLE_CLIENT_SECRET,
                        refresh_token: account.refresh_token,
                        grant_type: 'refresh_token'
                    })
                })
                const { access_token, expires_in } = await response.json()
                const expiry_date = Date.now() + expires_in * 1000
                await supabase
                    .from('gmail_accounts')
                    .update({ access_token, expiry_date })
                    .eq('id', batch.gmail_account_id)
                accessToken = access_token
            }

            const successIds = []
            for (const recipient of recipients) {
                const { data: canSend } = await supabase.rpc('increment_account_sent_safe', {
                    account_id: batch.gmail_account_id
                })

                if (!canSend) {
                    console.log(`[send-emails-worker] Daily limit reached for account ${account.email}`)
                    break
                }

                try {
                    // random delay between sends to prevent lookint like a bot
                    const delay = Math.floor(Math.random() * (120000 - 30000) + 30000)
                    await new Promise(r => setTimeout(r, delay))

                    await sendEmail({
                        accessToken,
                        from: account.email,
                        to: recipient.email,
                        subject: campaign.template.subject,
                        body: `${campaign.template.body}\n\n${campaign.meet_link}`
                    })

                    await supabase
                        .from('recipients')
                        .update({
                            status: 'sent',
                            sent_at: new Date().toISOString(),
                            sent_from: batch.gmail_account_id
                        })
                        .eq('id', recipient.id)

                    successIds.push(recipient.id)
                    console.log(`[send-emails-worker] Sent to ${recipient.email}`)

                } catch (err) {
                    // individual email failed, log and continue
                    console.error(`[send-emails-worker] Failed for ${recipient.email}`, err.message)
                    await supabase
                        .from('recipients')
                        .update({ status: 'failed', error: err.message })
                        .eq('id', recipient.id)
                }
            }

            // update db
            await Promise.all([
                supabase.rpc('increment_campaign_sent', {
                    campaign_id: batch.campaign_id,
                    inc: successIds.length
                }),
                supabase
                    .from('email_batches')
                    .update({ status: 'completed' })
                    .eq('id', batch_id)
            ])

            console.log(`[send-emails-worker] Batch ${batch_id} done. Sent: ${successIds.length}/${recipients.length}`)
        } catch (err) {
            console.error(`[worker] Failed for ${recipient_email}`, err);
            await supabase
                .from('email_batches')
                .update({ status: 'failed' })
                .eq('id', batch_id)
            throw err;
        }
    },
    {
        connection,
        limiter: {
            max: 20,
            duration: 3600000  // per hour 
        }
    }
);

worker.on('completed', (job) => {
    console.log(`[send-emails] Job completed: ${job.id}`);
});

worker.on('failed', async (job, err) => {
    console.error(`[send-emails] Job failed: ${job.id}`, err.message);
});

async function sendEmail({ accessToken, from, to, subject, body }) {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    )
    oauth2Client.setCredentials({ access_token: accessToken })
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

    const raw = [
        `From: ${from}`,
        `To: ${to}`,
        `Subject: ${subject}`,
        `Content-Type: text/plain; charset=utf-8`,
        ``,
        body
    ].join('\n')

    const encoded = Buffer.from(raw)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')

    await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw: encoded }
    })
}