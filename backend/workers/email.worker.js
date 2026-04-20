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
    console.log("Processing job:", job.id, job.data);
    const { recipient_id, email, campaign_id, account_id } = job.data;

    try {
      const [recRes, campaignRes, accountRes] = await Promise.all([
        supabase
          .from("recipients_d")
          .select("status")
          .eq("id", recipient_id)
          .single(),
        supabase.from("campaigns").select("*").eq("id", campaign_id).single(),
        supabase
          .from("gmail_accounts")
          .select("*")
          .eq("id", account_id)
          .single(),
      ]);

      const recipient = recRes.data;
      const campaign = campaignRes.data;
      const account = accountRes.data;

      //email already sent
      if (!recipient || recipient.status === "sent") return;

      //  DO NOT retry these
      if (!campaign || campaign.status === "paused") {
        console.log(`Campaign ${campaign_id} paused. Snoozing job...`);
        await job.moveToDelayed(Date.now() + 10 * 1000); //10sec check again from waiting queue
        return;
      }
      if (!account || account.status !== "active") {
        console.log(`Account ${account_id} not active. Snoozing job...`);
        await job.moveToDelayed(Date.now() + 1000); //30sec check again from waiting queue
        return;
      }

      const { data: canSend } = await supabase.rpc(
        "increment_account_sent_safe",
        { account_id },
      );

      if (!canSend) {
        console.log(
          `Account ${account_id} reached daily limit. Delaying until tomorrow...`,
        );
        // Move to delayed for 1 hour
        await job.moveToDelayed(Date.now() + 60 * 60 * 1000);
        return;
      }

      console.log("Sending email to:", email);
      await sendEmail(account, email, campaign.meet_link);

      await Promise.all([
        supabase
          .from("recipients_d")
          .update({ status: "sent", sent_at: new Date() })
          .eq("id", recipient_id),
        supabase.rpc("increment_campaign_sent", { campaign_id, inc: 1 }),
      ]);

      await sleep(4000); //total 5 sec per job
    } catch (err) {
      console.error("Worker error:", err.message);

      if (isRetryableError(err)) {
        console.log("Rate limited → slowing down...");
        await sleep(10000); // wait 10 sec
        throw err; //  BullMQ retries
      } else {
        console.error("ERROR - Not a Rate-Limit ERROR ", err);
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
  {
    connection,
    concurrency: 2,
  },
);
