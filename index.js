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
// Hardcoded endpoint for the specific Revenue Reports folder
app.get("/list_revenue_folder", async (req, res) => {
  try {
    const drive = await getDrive();
    const folderId = "1sw_89iwFMWbBUVvgNvr0HN8li6C1UQY4"; // Hardcoded Revenue Reports folder
    
    // Try multiple approaches to get the files
    const results = {};
    
    // Approach 1: Standard query
    try {
      const response1 = await drive.files.list({
        q: `'${folderId}' in parents and trashed=false`,
        fields: "files(id, name, mimeType, modifiedTime, webViewLink, parents, permissions)",
        pageSize: 100,
      });
      results.standard = {
        count: response1.data.files?.length || 0,
        files: response1.data.files || []
      };
    } catch (err) {
      results.standard = { error: err.message };
    }
    
    // Approach 2: With Shared Drive support
    try {
      const response2 = await drive.files.list({
        q: `'${folderId}' in parents`,
        fields: "files(id, name, mimeType, modifiedTime, webViewLink)",
        pageSize: 100,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        corpora: 'allDrives'
      });
      results.withSharedDrives = {
        count: response2.data.files?.length || 0,
        files: response2.data.files || []
      };
    } catch (err) {
      results.withSharedDrives = { error: err.message };
    }
    
    // Approach 3: Search for specific spreadsheets we know exist
    try {
      const response3 = await drive.files.list({
        q: `mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
        fields: "files(id, name, parents)",
        pageSize: 100,
      });
      
      // Filter for files that have this folder as parent
      const filesInFolder = response3.data.files?.filter(file => 
        file.parents && file.parents.includes(folderId)
      ) || [];
      
      results.spreadsheetsInFolder = {
        count: filesInFolder.length,
        files: filesInFolder
      };
    } catch (err) {
      results.spreadsheetsInFolder = { error: err.message };
    }
    
    // Approach 4: Get folder metadata first
    try {
      const folderMeta = await drive.files.get({
        fileId: folderId,
        fields: "id, name, mimeType, permissions, owners, sharingUser, ownedByMe, shared, capabilities"
      });
      results.folderMetadata = folderMeta.data;
    } catch (err) {
      results.folderMetadata = { error: err.message };
    }
    
    // Approach 5: Try without trashed=false
    try {
      const response5 = await drive.files.list({
        q: `'${folderId}' in parents`,
        fields: "files(id, name, trashed)",
        pageSize: 100,
      });
      results.withoutTrashedFilter = {
        count: response5.data.files?.length || 0,
        files: response5.data.files || []
      };
    } catch (err) {
      results.withoutTrashedFilter = { error: err.message };
    }
    
    res.json({
      success: true,
      folderId: folderId,
      folderName: "Revenue Reports (Hardcoded)",
      results: results,
      summary: {
        standardQuery: results.standard?.count || 0,
        withSharedDrives: results.withSharedDrives?.count || 0,
        spreadsheetsFound: results.spreadsheetsInFolder?.count || 0,
        withoutTrashedFilter: results.withoutTrashedFilter?.count || 0
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Alternative: List all accessible spreadsheets and check their parents
app.get("/find_revenue_sheets", async (req, res) => {
  try {
    const drive = await getDrive();
    const targetFolderId = "1sw_89iwFMWbBUVvgNvr0HN8li6C1UQY4";
    
    // Get ALL spreadsheets the service account can see
    const response = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
      fields: "files(id, name, parents, modifiedTime, webViewLink)",
      pageSize: 1000, // Get more files
    });
    
    const allSheets = response.data.files || [];
    
    // Filter for ones in the target folder
    const sheetsInTargetFolder = allSheets.filter(file => 
      file.parents && file.parents.includes(targetFolderId)
    );
    
    // Also show sheets without parents (might be shared individually)
    const sheetsWithoutParents = allSheets.filter(file => 
      !file.parents || file.parents.length === 0
    );
    
    res.json({
      success: true,
      targetFolderId: targetFolderId,
      totalAccessibleSheets: allSheets.length,
      sheetsInTargetFolder: {
        count: sheetsInTargetFolder.length,
        files: sheetsInTargetFolder
      },
      sheetsWithoutParentInfo: {
        count: sheetsWithoutParents.length,
        files: sheetsWithoutParents.slice(0, 10) // Show first 10
      },
      sampleOfAllSheets: allSheets.slice(0, 5).map(f => ({
        name: f.name,
        id: f.id,
        parents: f.parents
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// List files in a specific Google Drive folder (POST version)
app.post("/list_folder", async (req, res) => {
  try {
    const folderId = req.body.folderId;
    if (!folderId) {
      return res.status(400).json({ error: "Missing folderId in request body" });
    }
    const drive = await getDrive();
    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: "files(id, name, mimeType, modifiedTime, webViewLink)",
      pageSize: 100,
    });
    res.json({
      success: true,
      folderId,
      fileCount: response.data.files?.length || 0,
      files: response.data.files || [],
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

