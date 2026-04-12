import { supabase } from "../lib/supabase.js";
import { sendEmail } from "../services/sender.service.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const run = async () => {
  while (true) {
    const { data: batchData } = await supabase
      .from("email_batches")
      .select("*")
      .eq("status", "pending")
      .limit(1);
    const batch = batchData?.[0];
    if (!batch) {
      await sleep(3000);
      continue;
    }

    await supabase
      .from("email_batches")
      .update({ status: "processing" })
      .eq("id", batch.id);

    const { data: recipients } = await supabase
      .from("recipients")
      .select("*")
      .eq("campaign_id", batch.campaign_id)
      .eq("assigned_gmail_account_id", batch.gmail_account_id)
      .eq("status", "pending")
      .limit(batch.batch_size);

    if (!recipients || recipients.length === 0) {
      await supabase
        .from("email_batches")
        .update({ status: "completed" })
        .eq("id", batch.id);
      continue;
    }
    const { data: account } = await supabase
      .from("gmail_accounts")
      .select("*")
      .eq("id", batch.gmail_account_id)
      .single();

    const { data: campaign } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", batch.campaign_id)
      .single();

    const today = new Date().toDateString();
    const last = account.last_sent_at
      ? new Date(account.last_sent_at).toDateString()
      : null;
    if (last !== today) {
      await supabase
        .from("gmail_accounts")
        .update({ sent_today: 0 })
        .eq("id", account.id);
      account.sent_today = 0;
    }
    const successIds = [];
    const failed = [];

    for (let r of recipients) {
      try {
        // 1. mark as sending (reserve this recipient)
        await supabase
          .from("recipients")
          .update({ status: "sending" })
          .eq("id", r.id);
        //rpc function to check if we can send mail and increment the sent_count
        const { data: canSend } = await supabase.rpc(
          "increment_account_sent_safe",
          { account_id: account.id },
        );
        if (!canSend) {
          console.log("🚫 Limit reached to send mails:", account.email);
          await supabase
            .from("recipients")
            .update({ status: "pending" })
            .eq("id", r.id);

          break;
        }
        await sendEmail(account, r.email, campaign.meet_link);
        successIds.push(r.id);

        // Random delay between 8 and 20 seconds
        const randomDelay = Math.floor(
          Math.random() * (20000 - 8000 + 1) + 10000,
        );
        await sleep(randomDelay);

        // small delay (to avoid spam)
        // await sleep(500);
      } catch (err) {
        if (err.code === 429 || err.message.includes("rate limit")) {
          console.log("🛑 Google is rate limiting us. Stopping batch.");
          break;
        }
        failed.push({ id: r.id, error: err.message });
      }
    }

    // calling function created on database for atomic increment for sent_count for a campaign
    await supabase.rpc("increment_campaign_sent", {
      campaign_id: batch.campaign_id,
      inc: successIds.length,
    });
    // mark sent
    if (successIds.length > 0) {
      await supabase
        .from("recipients")
        .update({ status: "sent", sent_at: new Date() })
        .in("id", successIds);
    }

    // mark failed
    for (let f of failed) {
      await supabase
        .from("recipients")
        .update({
          status: "failed",
          error: f.error,
        })
        .eq("id", f.id);
    }

    await supabase
      .from("email_batches")
      .update({ status: "completed", sent_count: successIds.length })
      .eq("id", batch.id);
  }
};
