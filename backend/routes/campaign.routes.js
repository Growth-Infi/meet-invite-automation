import express from "express";
import {
  createCampaign,
  startCampaign,
  pauseCampaign,
  resumeCampaign,
} from "../controllers/campaign.controller.js";
const router = express.Router();

router.post("/create", createCampaign);
router.patch("/:id/start", startCampaign);
router.patch("/:id/pause", pauseCampaign);
router.patch("/:id/resume", resumeCampaign);

export default router;
