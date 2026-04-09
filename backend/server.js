import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import emailRoutes from "./routes/email.js";
import gmailRoutes from "./routes/gmail.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.use("/gmail", gmailRoutes);
app.use("/email", emailRoutes);

app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
});
