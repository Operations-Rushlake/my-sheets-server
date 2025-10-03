import express from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { GoogleAuth } from "google-auth-library";
import { google } from "googleapis";

const app = express();
const PORT = process.env.PORT || 3000;

// Google Sheets setup
const auth = new GoogleAuth({
  keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

// Just a health check route for Render
app.get("/", (req, res) => {
  res.send("✅ Google Sheets MCP server is running");
});

// Example MCP function (list spreadsheets)
app.get("/listSheets", async (req, res) => {
  try {
    // replace with real API call logic
    res.json({ sheets: ["Sheet1", "Sheet2", "Sheet3"] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Google Sheets MCP server running on port ${PORT}`);
});
