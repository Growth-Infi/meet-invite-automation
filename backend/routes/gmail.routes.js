import express from "express";
import {
  connectGmail,
  gmailCallback,
  getAccounts,
  updateGmailStatus,
} from "../controllers/gmail.controller.js";

const router = express.Router();

router.get("/connect", connectGmail);
router.get("/callback", gmailCallback);
router.get("/accounts", getAccounts);
router.patch("/:id/status", updateGmailStatus);

export default router;
