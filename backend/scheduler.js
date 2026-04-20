import { emailQueue } from "./lib/queue.js";
import { supabase } from "./lib/supabase.js";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MIN_DELAY = 30 * 1000; // 30 sec
const MAX_DELAY = 90 * 1000; // 90 sec

function getRandomDelay() {
  return MIN_DELAY + Math.random() * (MAX_DELAY - MIN_DELAY);
}

export const startScheduler = async () => {
  console.log("🚀 Scheduler started...");
  while (true) {
    try {
      const { data: accounts, error } = await supabase
        .from("gmail_accounts")
        .select("*")
        .eq("status", "active")
        .or(
          `next_send_at.is.null,next_send_at.lte.${new Date().toISOString()}`,
        );

      if (error) {
        console.error("Account fetch error:", error);
        await sleep(2000);
        continue;
      }
      for (const account of accounts) {
        const now = new Date();

        // Sender mail not ready yet
        if (account.next_send_at && new Date(account.next_send_at) > now) {
          continue;
        }
        const today = new Date().toDateString();
        const last = account.last_sent_at
          ? new Date(account.last_sent_at).toDateString()
          : null;
        if (last !== today) {
          await supabase
            .from("gmail_accounts")
            .update({ sent_today: 0 })
            .eq("id", account.id);
        }

        if (account.sent_today >= account.daily_limit) {
          continue;
        }
        const { data: recipient } = await supabase
          .from("recipients_d")
          .select("*")
          .eq("assigned_gmail_account_id", account.id)
          .eq("status", "pending")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (!recipient) continue;

        const { data: lockedRecipient, error: lockError } = await supabase
          .from("recipients_d")
          .update({ status: "sending" })
          .eq("id", recipient.id)
          .eq("status", "pending") // Only update if still pending
          .select()
          .single();

        // If data is null, someone else already grabbed this recipient
        if (!lockedRecipient || lockError) {
          console.log(
            `⚠️ Recipient ${recipient.id} already claimed by another worker.`,
          );
          continue;
        }
        await emailQueue.add(
          "send-email",
          {
            recipient_id: lockedRecipient.id,
            email: lockedRecipient.email,
            campaign_id: lockedRecipient.campaign_id,
            account_id: account.id,
          },
          {
            attempts: 3,
            backoff: {
              type: "exponential",
              delay: 2 * 60 * 1000,
            },
            removeOnComplete: true,
            removeOnFail: false,
          },
        );

        const delay = getRandomDelay();
        const buffer = 2000; // 2 sec safety
        await supabase
          .from("gmail_accounts")
          .update({
            next_send_at: new Date(Date.now() + delay + buffer),
          })
          .eq("id", account.id);
        console.log(
          `Queued 1 email for ${account.email}, next in ${Math.round(
            delay / 1000,
          )}s`,
        );
      }
    } catch (err) {
      console.error("Scheduler error:", err);
    }
    await sleep(3500);
  }
};
