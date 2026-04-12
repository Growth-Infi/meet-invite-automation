import { supabase } from "../lib/supabase.js";

export const assignRecipients = async (campaign_id, user_id) => {
  const { data: accounts, error: accError } = await supabase
    .from("gmail_accounts")
    .select("*")
    .eq("user_id", user_id);

  if (accError) {
    console.error("Accounts fetch error:", accError);
    return;
  }

  if (!accounts || accounts.length === 0) {
    throw new Error("No Gmail accounts found for this user");
  }

  const { data: recipients, error: recError } = await supabase
    .from("recipients")
    .select("*")
    .eq("campaign_id", campaign_id);

  if (recError) {
    console.error("Recipients fetch error:", recError);
    return;
  }

  console.log("Accounts:", accounts);
  console.log("Recipients:", recipients);

  // 🔥 KEY CHANGE: update each row instead of upsert
  for (let i = 0; i < recipients.length; i++) {
    const r = recipients[i];
    const account = accounts[i % accounts.length];

    const { error } = await supabase
      .from("recipients")
      .update({
        assigned_gmail_account_id: account.id,
      })
      .eq("id", r.id);

    if (error) {
      console.error("Update failed for recipient:", r.id, error);
    }
  }

  console.log("✅ Recipients assigned successfully");
};
