import express from "express";
import dotenv from "dotenv";
import gmailRoutes from "./routes/gmail.routes.js";
import campaignRoutes from "./routes/campaign.routes.js";
import { run } from "./workers/email.worker.js";
import ApiError from "./utils/apiError.js";

dotenv.config();

const app = express();
app.use(express.json());

app.use("/gmail", gmailRoutes);
app.use("/campaign", campaignRoutes);

//global error handler 
app.use((err, req, res, next) => {
  console.log("Global Error:", err)
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({ message: err.message })
  }
  return res.status(500).json({ message: "Internal Service Error" })
})
// run();
app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
});
