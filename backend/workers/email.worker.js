import "../config.js";

import { supabase } from "../lib/supabase.js";
import { sendEmail } from "../services/sender.service.js";
import { connection } from "../lib/queue.js";
import { Worker } from "bullmq";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const isRetryableError = (err) => {
  return (
    err.code === 429 ||
    err.code === "ECONNRESET" ||
    err.code === "ETIMEDOUT" ||
    err.code === "EAI_AGAIN" ||
    (err.response?.status >= 500 && err.response?.status < 600)
  );
};
const worker = new Worker(
  "email-queue",
  async (job) => {
    const { recipient_id, email, campaign_id, account_id } = job.data;

    try {
      const { data: recipient } = await supabase
        .from("recipients_d")
        .select("status")
        .eq("id", recipient_id)
        .single();

      if (!recipient || recipient.status === "sent") return;

      const [campaignRes, accountRes] = await Promise.all([
        supabase.from("campaigns").select("*").eq("id", campaign_id).single(),
        supabase
          .from("gmail_accounts")
          .select("*")
          .eq("id", account_id)
          .single(),
      ]);

      const campaign = campaignRes.data;
      const account = accountRes.data;

      //  DO NOT retry these
      if (!campaign || campaign.status !== "running") return;
      if (!account || account.status !== "active") return;

      // reset daily
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

      const { data: canSend } = await supabase.rpc(
        "increment_account_sent_safe",
        { account_id },
      );

      if (!canSend) return; //  no retry

      const jitter = Math.floor(Math.random() * 2000); // 0–2 sec
      await sleep(1000 + jitter);
      await sendEmail(account, email, campaign.meet_link);
      await sleep(4000); //total 5 sec per job
      await supabase
        .from("recipients_d")
        .update({
          status: "sent",
          sent_at: new Date(),
        })
        .eq("id", recipient_id);

      await supabase.rpc("increment_campaign_sent", {
        campaign_id,
        inc: 1,
      });
    } catch (err) {
      console.error("Worker error:", err.message);
      if (err.code === 429) {
        console.log("Rate limited → slowing down...");
        await sleep(10000); // wait 10 sec
        throw err;
      }
      if (isRetryableError(err)) {
        throw err; //  BullMQ retries
      } else {
        //  mark permanently failed
        await supabase
          .from("recipients_d")
          .update({
            status: "failed_final",
            error: err.message,
          })
          .eq("id", job.data.recipient_id);

        return; // no retry
      }
    }
  },
  { connection, concurrency: 5 },
);
