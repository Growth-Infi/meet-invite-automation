import { google } from "googleapis";
import { oauth2Client } from "../lib/google.js";

export const sendEmail = async (account, to, meet_link) => {
  oauth2Client.setCredentials({
    refresh_token: account.refresh_token,
  });

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  const message =
    `From: ${account.email}\r\n` +
    `To: ${to}\r\n` +
    `Subject: Meeting Invite \r\n` +
    `Content-Type: text/plain; charset="UTF-8"\r\n` +
    `\r\n` +
    `Join here: ${meet_link}`;
  const encoded = Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: encoded,
    },
  });
};
