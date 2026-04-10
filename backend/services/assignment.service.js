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

  let i = 0;

  for (let r of recipients) {
    const account = accounts[i % accounts.length];

    await supabase
      .from("recipients")
      .update({
        assigned_gmail_account_id: account.id,
      })
      .eq("id", r.id);

    i++;
  }
};
