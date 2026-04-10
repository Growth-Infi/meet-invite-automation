import { supabase } from "../lib/supabase.js";

export const uploadRecipients = async (req, res) => {
  const { campaign_id, emails } = req.body;

  const rows = emails.map((email) => ({
    campaign_id,
    email,
  }));

  const { error } = await supabase.from("recipients").insert(rows);

  if (error) return res.status(500).json(error);

  res.json({ message: "Recipients added" });
};
