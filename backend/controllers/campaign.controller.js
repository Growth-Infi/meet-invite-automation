import { supabase } from "../lib/supabase.js";
import { assignRecipients } from "../services/assignment.service.js";
import { createBatches } from "../services/batch.service.js";

export const startCampaign = async (req, res) => {
  const { campaign_id, user_id } = req.body;

  await supabase
    .from("campaigns")
    .update({ status: "running" })
    .eq("id", campaign_id);

  await assignRecipients(campaign_id, user_id);
  await createBatches(campaign_id);

  res.json({ message: "Campaign started" });
};

export const createCampaign = async (req, res) => {
  const { user_id, name, meet_link, emails } = req.body;

  const { data: campaign, error } = await supabase
    .from("campaigns")
    .insert([{ user_id, name, meet_link, total_recipients: emails.length }])
    .select()
    .single();

  if (error) return res.status(500).json(error);
  const rows = emails.map((email) => ({
    campaign_id: campaign.id,
    email: email.trim(),
  }));

  // await supabase.from("recipients").insert(rows);
  const chunkSize = 500;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);

    const { error: upsertErr } = await supabase
      .from("recipients")
      .upsert(chunk, { onConflict: "campaign_id, email" });

    if (upsertErr) {
      console.error("Chunk upsert failed:", upsertErr);
      // ?? Delete campaign or handle partial failure
    } else {
      console.log(`Processed chunk: ${i + chunk.length} / ${rows.length}`);
    }
  }
  console.log(`✅ ${rows.length} recipients filled with bulk requests `);

  res.json(campaign);
};
