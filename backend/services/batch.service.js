import { supabase } from "../lib/supabase.js";

export const createBatches = async (campaign_id) => {
  const { data: recipients } = await supabase
    .from("recipients")
    .select("*")
    .eq("campaign_id", campaign_id);

  const groups = {};
  for (let r of recipients) {
    if (!groups[r.assigned_gmail_account_id]) {
      groups[r.assigned_gmail_account_id] = [];
    }
    groups[r.assigned_gmail_account_id].push(r);
  }

  const BATCH_SIZE = 2;
  const batchesToInsert = [];
  for (let account_id in groups) {
    const list = groups[account_id];
    for (let i = 0; i < list.length; i += BATCH_SIZE) {
      const chunk = list.slice(i, i + BATCH_SIZE);
      batchesToInsert.push({
        campaign_id,
        gmail_account_id: account_id,
        batch_size: chunk.length,
        status: "pending",
      });
    }
  }

  if (batchesToInsert.length > 0) {
    const { error } = await supabase
      .from("email_batches")
      .insert(batchesToInsert);

    if (error) console.error("Bulk insert failed:", error);
  }
};
