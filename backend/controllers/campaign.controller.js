import { supabase } from "../lib/supabase.js";
import { assignRecipients } from "../services/assignment.service.js";
import { createBatches } from "../services/batch.service.js";
import { sendEmail } from "../services/sender.service.js";

export const startCampaign = async (req, res) => {
  const { campaign_id, user_id } = req.body;

  await assignRecipients(campaign_id, user_id);
  await createBatches(campaign_id);

  res.json({ message: "Campaign started" });
};

export const createCampaign = async (req, res) => {
  const { user_id, name, meet_link } = req.body;

  const { data, error } = await supabase
    .from("campaigns")
    .insert([{ user_id, name, meet_link }])
    .select()
    .single();

  if (error) return res.status(500).json(error);

  res.json(data);
};

export const sendTestEmail = async (req, res) => {
  const { user_id, to } = req.body;

  // get one gmail account
  const { data: account } = await supabase
    .from("gmail_accounts")
    .select("*")
    .eq("user_id", user_id)
    .limit(1)
    .single();

  if (!account) return res.status(400).send("No account found");

  try {
    await sendEmail(account, to, "https://meet.google.com/test");

    res.send("Email sent 🚀");
  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to send");
  }
};
