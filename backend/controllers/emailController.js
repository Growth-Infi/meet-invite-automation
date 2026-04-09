import { google } from "googleapis";
import { supabase } from "../lib/supabase.js";
import { oauth2Client } from "../lib/google.js";

export const sendEmail = async (req, res) => {
  try {
    const { user_id, to, subject, message } = req.body;

    if (!user_id || !to) {
      return res.status(400).send("Missing fields");
    }

    const { data: accounts, error } = await supabase
      .from("gmail_accounts")
      .select("*")
      .eq("user_id", user_id)
      .eq("status", "active")
      .limit(1);

    if (error || !accounts.length) {
      return res.status(400).send("No Gmail accounts connected");
    }

    const account = accounts[0];

    // Set credentials (AUTO refresh happens here)
    oauth2Client.setCredentials({
      refresh_token: account.refresh_token,
    });

    const gmail = google.gmail({
      version: "v1",
      auth: oauth2Client,
    });

    const emailContent =
      `From: ${account.email}\r\n` +
      `To: ${to}\r\n` +
      `Subject: ${subject || "Test Mail"}\r\n` +
      `Content-Type: text/plain; charset="UTF-8"\r\n` +
      `\r\n` +
      `${message || "Hello from Growthinfi 🚀"}`;

    const encodedMessage = Buffer.from(emailContent)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

    // 🔥 4. Send email
    await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encodedMessage,
      },
    });

    res.send(`✅ Email sent from ${account.email} to ${to}`);
  } catch (err) {
    console.error("SEND ERROR:", err);
    res.status(500).send("Failed to send email");
  }
};
