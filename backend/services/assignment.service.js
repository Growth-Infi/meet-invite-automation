import { supabase } from "../lib/supabase.js";

export const assignRecipients = async (campaign_id, user_id) => {
  const { data: accounts } = await supabase
    .from("gmail_accounts")
    .select("*")
    .eq("user_id", user_id);

  const { data: recipients } = await supabase
    .from("recipients")
    .select("*")
    .eq("campaign_id", campaign_id);

  const updates = recipients.map((r, i) => {
    const account = accounts[i % accounts.length];
    return {
      id: r.id,
      assigned_gmail_account_id: account.id,
    };
  });

  await supabase.from("recipients").upsert(updates);
};
