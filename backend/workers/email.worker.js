import { supabase } from "../lib/supabase.js";
import { sendEmail } from "../services/sender.service.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  while (true) {
    const { data: batch } = await supabase
      .from("email_batches")
      .select("*")
      .eq("status", "pending")
      .limit(1)
      .single();

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

    const successIds = [];
    const failed = [];

    for (let r of recipients) {
      try {
        await sendEmail(account, r.email, campaign.meet_link);
        successIds.push(r.id);
      } catch (err) {
        failed.push({ id: r.id, error: err.message });
      }
    }
    // mark sent
    if (successIds.length > 0) {
      await supabase
        .from("recipients")
        .update({ status: "sent" })
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
      .update({ status: "completed" })
      .eq("id", batch.id);
  }
}

run();
