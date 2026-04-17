import express from "express";
import dotenv from "dotenv";
import gmailRoutes from "./routes/gmail.routes.js";
import campaignRoutes from "./routes/campaign.routes.js";
import "./config.js";
dotenv.config();

const app = express();
app.use(express.json());

app.use("/gmail", gmailRoutes);
app.use("/campaign", campaignRoutes);
app.listen(5000, () => {
  console.log("Server running on port 5000");
});
