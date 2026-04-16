import { supabase } from "../lib/supabase.js";
import { sendEmail } from "../services/sender.service.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MAX_RETRIES = 3;
export const run = async () => {
  while (true) {
    let stoppedEarly = false;

    const { data: batch } = await supabase.rpc("claim_next_batch");
    if (!batch) {
      await sleep(3000);
      continue;
    }

    await supabase
      .from("email_batches")
      .update({ status: "processing" })
      .eq("id", batch.id);

    const now = new Date().toISOString();
    // console.log("Current time isoString ", now);

    const { data: recipients_d } = await supabase
      .from("recipients_d")
      .select("*")
      .eq("campaign_id", batch.campaign_id)
      .eq("assigned_gmail_account_id", batch.gmail_account_id)
      .or(
        `status.eq.pending, and(status.eq.failed,retry_count.lt.${MAX_RETRIES},next_retry_at.lte.${now})`,
      )
      .limit(batch.batch_size);

    // if (!recipients_d || recipients_d.length === 0) {
    //   await supabase
    //     .from("email_batches")
    //     .update({ status: "completed" })
    //     .eq("id", batch.id);
    //   continue;
    // }

    if (!recipients_d || recipients_d.length === 0) {
      await supabase
        .from("email_batches")
        .update({ status: "completed" })
        .eq("id", batch.id);
      continue;
    }
    // Check if ANY work remains for this batch
    const { count: remaining } = await supabase
      .from("recipients_d")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", batch.campaign_id)
      .eq("assigned_gmail_account_id", batch.gmail_account_id)
      .in("status", ["pending", "failed"]);

    if (remaining === 0) {
      await supabase
        .from("email_batches")
        .update({ status: "completed" })
        .eq("id", batch.id);
    } else {
      await supabase
        .from("email_batches")
        .update({ status: "pending" })
        .eq("id", batch.id);
    }

    const [accountRes, campaignRes] = await Promise.all([
      supabase
        .from("gmail_accounts")
        .select("*")
        .eq("id", batch.gmail_account_id)
        .single(),
      supabase
        .from("campaigns")
        .select("*")
        .eq("id", batch.campaign_id)
        .single(),
    ]);

    const account = accountRes.data;
    const campaign = campaignRes.data;

    if (account.status !== "active") {
      await supabase
        .from("email_batches")
        .update({ status: "pending" })
        .eq("id", batch.id);
      console.log("Sender email paused ", account.email);
      continue;
    }

    if (!campaign || campaign.status !== "running") {
      await supabase
        .from("email_batches")
        .update({ status: "pending" })
        .eq("id", batch.id);
      console.log("Campaign paused  ", campaign.name);
      await sleep(2000);
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
      account.sent_today = 0;
    }
    const successIds = [];
    const failed = [];

    for (let i = 0; i < recipients_d.length; i++) {
      const r = recipients_d[i];
      try {
        if (i % 5 == 0) {
          //check if campaign or any sender mail account paused
          const [latestCampaign, latestAccount] = await Promise.all([
            supabase
              .from("campaigns")
              .select("status")
              .eq("id", batch.campaign_id)
              .single(),
            supabase
              .from("gmail_accounts")
              .select("status")
              .eq("id", account.id)
              .single(),
          ]);

          const isCampaignPaused = latestCampaign.data?.status !== "running";
          const isAccountInactive = latestAccount.data?.status !== "active";

          if (isCampaignPaused || isAccountInactive) {
            console.log(
              `Stopping mid-batch: ${isCampaignPaused ? "Campaign paused" : "Account inactive"}`,
            );
            stoppedEarly = true;
            break;
          }
        }

        //rpc function to check if we can send mail and increment the sent_count
        const { data: canSend } = await supabase.rpc(
          "increment_account_sent_safe",
          { account_id: account.id },
        );
        if (!canSend) {
          stoppedEarly = true;
          console.log("🚫 Limit reached to send mails:", account.email);
          await supabase
            .from("recipients_d")
            .update({ status: "pending" })
            .eq("id", r.id);

          break;
        }
        await sendEmail(account, r.email, campaign.meet_link);
        successIds.push(r.id);

        // Random delay between 9 and 20 seconds
        const randomDelay = Math.floor(
          Math.random() * (20000 - 9000 + 1) + 10000,
        );
        await sleep(randomDelay);
      } catch (err) {
        const status_retry = err.response?.status;

        const isRetryable =
          err.code === 429 ||
          status_retry === 429 ||
          err.code === "ECONNRESET" ||
          err.code === "ETIMEDOUT" ||
          err.code === "EAI_AGAIN" ||
          (status_retry >= 500 && status_retry < 600) ||
          /rate|timeout|network/i.test(err.message || "");

        if (isRetryable) {
          stoppedEarly = true;
          const retryCount = (r.retry_count || 0) + 1;

          if (retryCount > MAX_RETRIES) {
            //retry attempts exceeded
            console.error(
              `Retry limit exceeded (retry count - ${retryCount}), and thus stopping permanent. Error-  `,
              err.message,
            );

            await supabase
              .from("recipients_d")
              .update({
                status: "failed_final",
                error: err.message,
              })
              .eq("id", r.id);
            continue;
          }

          const baseDelay = 2 * 60 * 1000;
          const exponentialDelay = baseDelay * Math.pow(2, retryCount - 1);
          const jitter = Math.random() * 1000;
          const delayMs = Math.min(exponentialDelay + jitter, 30 * 60 * 1000);

          const nextRetry = new Date(Date.now() + delayMs);

          await supabase
            .from("recipients_d")
            .update({
              status: "failed",
              retry_count: retryCount,
              last_attempt_at: new Date(),
              next_retry_at: nextRetry,
              error: err.message,
            })
            .eq("id", r.id);
        } else {
          console.error("ERROR, and not retrying  ", err.message);

          await supabase
            .from("recipients_d")
            .update({
              status: "failed_final",
              error: err.message,
            })
            .eq("id", r.id);
        }

        failed.push({ id: r.id, error: err.message });
      }
    }

    // calling function created on database for atomic increment for sent_count for a campaign
    if (successIds.length > 0) {
      await supabase.rpc("increment_campaign_sent", {
        campaign_id: batch.campaign_id,
        inc: successIds.length,
      });

      // mark sent for all success recipients
      await supabase
        .from("recipients_d")
        .update({ status: "sent", sent_at: new Date() })
        .in("id", successIds);
    }

    // email_batch status update
    if (successIds.length > 0) {
      await supabase.rpc("increment_batch_sent", {
        batch_id: batch.id,
        inc: successIds.length,
      });
    }
    await supabase
      .from("email_batches")
      .update({
        status: stoppedEarly ? "pending" : "completed",
      })
      .eq("id", batch.id);

    const { count } = await supabase
      .from("recipients_d")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", batch.campaign_id)
      .in("status", ["pending", "failed"]);
    if (count === 0) {
      await supabase
        .from("campaigns")
        .update({ status: "completed" })
        .eq("id", batch.campaign_id);

      console.log("🎉 Campaign completed:", batch.campaign_id);
    }
  }
};
