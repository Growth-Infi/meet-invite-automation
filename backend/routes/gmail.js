import express from "express";
import {
  connectGmail,
  gmailCallback,
  getAccounts,
} from "../controllers/gmailController.js";

const router = express.Router();

router.get("/connect", connectGmail);
router.get("/callback", gmailCallback);
router.get("/accounts", getAccounts);

export default router;
