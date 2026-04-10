import express from "express";
import { uploadRecipients } from "../controllers/recipient.controller.js";
import {
  createCampaign,
  startCampaign,
  sendTestEmail,
} from "../controllers/campaign.controller.js";
const router = express.Router();

router.post("/create", createCampaign);
router.post("/upload", uploadRecipients);
router.post("/start", startCampaign);
router.post("/send-test", sendTestEmail);

export default router;
