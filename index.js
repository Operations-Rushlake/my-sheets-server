// index.js
import express from "express";
import { google } from "googleapis";

const app = express();
app.use(express.json());

// Load credentials
const CREDENTIALS_PATH = process.env.CREDENTIALS_PATH || "/etc/secrets/typingmind.json";
const SERVICE_ACCOUNT = process.env.SERVICE_ACCOUNT;

const auth = new google.auth.GoogleAuth({
  keyFile: CREDENTIALS_PATH,
  scopes: [
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/spreadsheets",
  ],
});

async function getSheets() {
  const authClient = await auth.getClient();
  return google.sheets({ version: "v4", auth: authClient });
}

async function getDrive() {
  const authClient = await auth.getClient();
  return google.drive({ version: "v3", auth: authClient });
}

// Routes
app.get("/", (req, res) => {
  res.send("✅ Google Sheets MCP server is running");
});

// List Sheets
app.get("/list_sheets", async (req, res) => {
  try {
    const drive = await getDrive();
    const response = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
      fields: "files(id, name, modifiedTime)",
      orderBy: "modifiedTime desc",
      pageSize: 100,
    });

    const files = response.data.files || [];
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// List Folder files
app.get("/list_folder_files", async (req, res) => {
  try {
    const folderId = req.query.folderId;

    if (!folderId) {
      return res.status(400).json({ error: "Missing folderId query parameter" });
    }

    const drive = await getDrive();

    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: "files(id, name, mimeType, modifiedTime)",
      orderBy: "modifiedTime desc",
    });

    res.json({
      success: true,
      folderId,
      fileCount: response.data.files.length,
      files: response.data.files,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Read Sheet
app.post("/read_sheet", async (req, res) => {
  try {
    const { spreadsheetId, range } = req.body;
    const sheets = await getSheets();
    const response = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    res.json(response.data.values || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Write Sheet
app.post("/write_sheet", async (req, res) => {
  try {
    const { spreadsheetId, range, values } = req.body;
    const sheets = await getSheets();
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      resource: { values },
    });
    res.json(response.data.updates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update Sheet (Fixed for TypingMind)
app.post("/update_sheet", async (req, res) => {
  try {
    const { spreadsheetId, range, values } = req.body;
    const sheets = await getSheets();

    // If TypingMind sends "values" as a string, parse it safely
    let parsedValues = values;
    if (typeof values === "string") {
      try {
        parsedValues = JSON.parse(values);
      } catch (err) {
        return res.status(400).json({ error: "Invalid JSON in 'values' field" });
      }
    }

    const response = await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: "USER_ENTERED",
      resource: { values: parsedValues },
    });

    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



// ============ ADD THE DEBUG ENDPOINT HERE ============
// Debug endpoint - ADD THIS TO YOUR index.js
app.post("/test_params", async (req, res) => {
  // This endpoint just echoes back what it receives - no Google Sheets API calls
  res.json({
    success: true,
    message: "Debug endpoint - showing what was received",
    received_body: req.body,
    spreadsheetId_details: {
      value: req.body.spreadsheetId,
      type: typeof req.body.spreadsheetId,
      length: req.body.spreadsheetId ? req.body.spreadsheetId.length : 0,
      has_quotes: req.body.spreadsheetId ? req.body.spreadsheetId.includes('"') : false,
      has_spaces: req.body.spreadsheetId ? req.body.spreadsheetId.includes(' ') : false,
      has_template: req.body.spreadsheetId ? req.body.spreadsheetId.includes('{{') : false
    },
    range_details: {
      value: req.body.range,
      type: typeof req.body.range
    },
    values_details: {
      value: req.body.values,
      type: typeof req.body.values,
      stringified: JSON.stringify(req.body.values)
    }
  });
});
// ============ END OF DEBUG ENDPOINT ============

// Start server (THIS SHOULD BE THE LAST THING IN YOUR FILE)
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Google Sheets MCP server running on port ${PORT}`);
});

