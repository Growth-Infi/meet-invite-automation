import express from "express";
import {
  createCampaign,
  startCampaign,
} from "../controllers/campaign.controller.js";
const router = express.Router();

router.post("/create", createCampaign);
router.post("/start", startCampaign);

export default router;
