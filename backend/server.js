import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import ApiError from "./utils/apiError.js";
import gmailRoutes from "./routes/gmail.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.use("/gmail", gmailRoutes);

//global error handler 
app.use((err, req, res, next) => {
  console.log("Global Error:", err)
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({ message: err.message })
  }
  return res.status(500).json({ message: "Internal Service Error" })
})

app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
});
