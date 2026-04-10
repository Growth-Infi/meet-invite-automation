import { oauth2Client } from "../lib/google.js";
import { google } from "googleapis";
import { supabase } from "../lib/supabase.js";

//  Redirect user to Google
export const connectGmail = (req, res) => {
  const user_id = req.query.user_id;

  if (!user_id) {
    return res.status(400).send("Missing user_id");
  }

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
    prompt: "consent",
    state: user_id,
  });

  res.redirect(url);
};

// Handle callback
export const gmailCallback = async (req, res) => {
  try {
    const code = req.query.code;
    const user_id = req.query.state;

    if (!code) {
      return res.status(400).send("Missing code");
    }

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);

    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({
      auth: oauth2Client,
      version: "v2",
    });

    const userInfo = await oauth2.userinfo.get();

    const email = userInfo.data.email;

    console.log("Connected Gmail:", email);

    const { error } = await supabase.from("gmail_accounts").insert({
      user_id,
      email,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    });
    if (error) {
      console.error("DB ERROR:", error);
      return res.status(500).send("Error saving account");
    }

    res.send(` Gmail connected Success: ${email}`);
  } catch (err) {
    console.error("FULL ERROR:", err);
    console.error("ERROR RESPONSE:", err.response?.data);
    res.status(500).send("OAuth failed");
  }
};

// Fetch all connected accounts
export const getAccounts = async (req, res) => {
  const user_id = req.query.user_id;

  if (!user_id) {
    return res.status(400).send("Missing user_id");
  }

  const { data, error } = await supabase
    .from("gmail_accounts")
    .select("*")
    .eq("user_id", user_id);

  if (error) {
    console.error("FETCH ERROR:", error);
    return res.status(500).json({ error });
  }

  res.json(data);
};
