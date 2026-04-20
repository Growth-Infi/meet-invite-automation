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

console.log("🚀 Email Worker starting...");
console.log("REDIS_URL:", process.env.REDIS_URL ? "✅ Present" : "❌ Missing");

const worker = new Worker(
  "email-queue",
  async (job) => {
    console.log(" Processing job:", job.id);

    const { recipient_id, email, campaign_id, account_id } = job.data;

    try {
      console.log(" Fetching DB data...");

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

      console.log("DB fetch done");

      const recipient = recRes.data;
      const campaign = campaignRes.data;
      const account = accountRes.data;

      if (!recipient || recipient.status === "sent") {
        console.log(" Already sent the mail, skipping");
        return;
      }

      if (!campaign || campaign.status === "paused") {
        console.log(` Campaign paused → delaying job`);
        await job.moveToDelayed(Date.now() + 10 * 1000);
        return;
      }

      if (!account || account.status !== "active") {
        console.log(` Account inactive → delaying job`);
        await job.moveToDelayed(Date.now() + 1000);
        return;
      }

      const { data: canSend } = await supabase.rpc(
        "increment_account_sent_safe",
        { account_id },
      );

      if (!canSend) {
        console.log(" Daily limit reached → delaying 1 hour");
        await job.moveToDelayed(Date.now() + 60 * 60 * 1000);
        return;
      }

      console.log(" Sending email to:", email);

      await sendEmail(account, email, campaign.meet_link);

      console.log("✅ Email sent");

      await Promise.all([
        supabase
          .from("recipients_d")
          .update({ status: "sent", sent_at: new Date() })
          .eq("id", recipient_id),
        supabase.rpc("increment_campaign_sent", { campaign_id, inc: 1 }),
      ]);

      console.log(" DB updated");

      await sleep(4000);
    } catch (err) {
      console.error(" Worker error:", err.message);

      if (isRetryableError(err)) {
        console.log(" Retryable error → retrying...");
        await sleep(10000);
        throw err;
      } else {
        console.error(" Final failure:", err.message);

        await supabase
          .from("recipients_d")
          .update({
            status: "failed_final",
            error: err.message,
          })
          .eq("id", job.data.recipient_id);

        return;
      }
    }
  },
  {
    connection,
    concurrency: 2,
  },
);
worker.on("ready", () => {
  console.log("🟢 Worker connected to Redis and ready");
});

worker.on("error", (err) => {
  console.error("🔴 Worker connection error:", err);
});

worker.on("failed", (job, err) => {
  console.error(`❌ Job ${job.id} failed:`, err.message);
});

worker.on("completed", (job) => {
  console.log(`✅ Job ${job.id} completed`);
});
