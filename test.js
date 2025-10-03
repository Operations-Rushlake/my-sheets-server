import { google } from "googleapis";
import { Server } from "@modelcontextprotocol/sdk/server";
import "dotenv/config";

/* --------------------
   ENVIRONMENT & AUTH
-------------------- */

// Ensure these are set in your .env file
const KEY_FILE = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const SERVICE_ACCOUNT_EMAIL = process.env.SERVICE_ACCOUNT_EMAIL;

const auth = new google.auth.GoogleAuth({
  keyFile: KEY_FILE,
  scopes: [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/spreadsheets",
  ],
});

/**
 * Creates and returns authenticated Google Drive and Sheets API clients.
 */
async function getClients() {
  const client = await auth.getClient();
  const drive = google.drive({ version: "v3", auth: client });
  const sheets = google.sheets({ version: "v4", auth: client });
  return { drive, sheets };
}

/* --------------------
   TOOL FUNCTIONS
-------------------- */

/**
 * Lists all spreadsheets shared with the service account.
 */
async function listSpreadsheets() {
  const { drive } = await getClients();
  const res = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.spreadsheet' and '${SERVICE_ACCOUNT_EMAIL}' in writers`,
    fields: "files(id, name)",
  });
  return res.data.files;
}

/**
 * Reads a range from a Google Sheet.
 */
async function readSheet(spreadsheetId, range) {
  const { sheets } = await getClients();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  return res.data.values;
}

/**
 * Appends new rows to a Google Sheet.
 */
async function writeSheet(spreadsheetId, range, values) {
  const { sheets } = await getClients();
  const res = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    resource: { values },
  });
  return res.data.updates;
}

/**
 * Updates an existing range in a Google Sheet.
 */
async function updateSheet(spreadsheetId, range, values) {
  const { sheets } = await getClients();
  const res = await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    resource: { values },
  });
  return res.data.updatedRange;
}

/* --------------------
   SERVER SETUP
-------------------- */

// 1. Create the server instance with capabilities and serverInfo directly in the constructor
const server = new Server({
  capabilities: {
    // Declaring 'prompts' capability with 'listChanged' feature flag
    prompts: {
      listChanged: true
    },
    // Declaring 'tools' capability with 'listChanged' feature flag
    tools: {
      listChanged: true
    },
    // Declaring 'resources' capability with 'subscribe' and 'listChanged' feature flags
    resources: {
      subscribe: true,
      listChanged: true
    },
    // You might also need to declare 'logging' and 'completions' if the SDK expects them,
    // even if empty, as per the documentation's example.
  },
  serverInfo: {
    name: "my-sheets-server",
    version: "1.0.0",
  },
});

// 2. Register tools one by one
server.tool("listSpreadsheets", {
  description: "List all spreadsheets shared with the service account",
  inputSchema: { type: "object", properties: {} },
  execute: async () => listSpreadsheets(),
});

server.tool("readSheet", {
  description: "Read a range from a Google Sheet",
  inputSchema: {
    type: "object",
    properties: {
      spreadsheetId: { type: "string" },
      range: { type: "string" },
    },
    required: ["spreadsheetId", "range"],
  },
  execute: async (args) => readSheet(args.spreadsheetId, args.range),
});

server.tool("writeSheet", {
  description: "Append new rows to a Google Sheet",
  inputSchema: {
    type: "object",
    properties: {
      spreadsheetId: { type: "string" },
      range: { type: "string" },
      values: { type: "array" },
    },
    required: ["spreadsheetId", "range", "values"],
  },
  execute: async (args) => writeSheet(args.spreadsheetId, args.range, args.values),
});

server.tool("updateSheet", {
  description: "Update an existing range in a Google Sheet",
  inputSchema: {
    type: "object",
    properties: {
      spreadsheetId: { type: "string" },
      range: { type: "string" },
      values: { type: "array" },
    },
    required: ["spreadsheetId", "range", "values"],
  },
  execute: async (args) => updateSheet(args.spreadsheetId, args.range, args.values),
});

// 3. Start the server
server.listen(3000);
console.log("🚀 Server listening on port 3000");

