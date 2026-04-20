import { google } from "googleapis";
import { supabase } from "../lib/supabase.js";

export const sendEmail = async (account, to, meet_link) => {
  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );
    // 1. Set full credentials
    oauth2Client.setCredentials({
      refresh_token: account.refresh_token,
      access_token: account.access_token,
      expiry_date: account.expiry_date
        ? new Date(account.expiry_date).getTime()
        : null,
    });

    // 2. Listen for token refresh
    oauth2Client.on("tokens", async (tokens) => {
      console.log("🔄 Token refreshed");

      await supabase
        .from("gmail_accounts")
        .update({
          access_token: tokens.access_token,
          expiry_date: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        })
        .eq("id", account.id);
    });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    const message =
      `From: ${account.email}\r\n` +
      `To: ${to}\r\n` +
      `Subject: Meeting Invite\r\n` +
      `Content-Type: text/plain; charset="UTF-8"\r\n\r\n` +
      `Join here: ${meet_link}`;

    const encoded = Buffer.from(message)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

    const res = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: encoded },
    });

    return res.data; // contains id + threadId
  } catch (err) {
    console.error("SEND ERROR:", err?.response?.data || err);

    // Handle token revoked case
    if (err?.response?.status === 401) {
      await supabase
        .from("gmail_accounts")
        .update({ status: "blocked" })
        .eq("id", account.id);
    }

    throw err;
  }
};
