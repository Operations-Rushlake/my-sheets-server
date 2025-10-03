// index.js
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { google } from "googleapis";
import dotenv from "dotenv";
dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;
// Hardcode credentials
// Load credentials from .env
const CREDENTIALS_PATH = process.env.CREDENTIALS_PATH;
const SERVICE_ACCOUNT = process.env.SERVICE_ACCOUNT;


// Initialize Google Auth
const auth = new google.auth.GoogleAuth({
  keyFile: CREDENTIALS_PATH,
  scopes: [
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/spreadsheets",
  ],
});

// Helper functions
async function getSheets() {
  const authClient = await auth.getClient();
  return google.sheets({ version: "v4", auth: authClient });
}

async function getDrive() {
  const authClient = await auth.getClient();
  return google.drive({ version: "v3", auth: authClient });
}

// Create server
const server = new Server(
  {
    name: "google-sheets-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define tools
const tools = [
  {
    name: "list_sheets",
    description: "List all Google Sheets shared with the service account",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "read_sheet",
    description: "Read data from a Google Sheet",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheetId: {
          type: "string",
          description: "The ID of the Google Sheet",
        },
        range: {
          type: "string",
          description: "The A1 notation range (e.g., 'Sheet1!A1:B10')",
        },
      },
      required: ["spreadsheetId", "range"],
    },
  },
  {
    name: "write_sheet",
    description: "Append new rows to a Google Sheet",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheetId: {
          type: "string",
          description: "The ID of the Google Sheet",
        },
        range: {
          type: "string",
          description: "The starting range (e.g., 'Sheet1!A1')",
        },
        values: {
          type: "array",
          description: "2D array of values to append",
          items: {
            type: "array",
            items: { type: "string" },
          },
        },
      },
      required: ["spreadsheetId", "range", "values"],
    },
  },
  {
    name: "update_sheet",
    description: "Update existing cells in a Google Sheet",
    inputSchema: {
      type: "object",
      properties: {
        spreadsheetId: {
          type: "string",
          description: "The ID of the Google Sheet",
        },
        range: {
          type: "string",
          description: "The range to update (e.g., 'Sheet1!A1:B2')",
        },
        values: {
          type: "array",
          description: "2D array of values to update",
          items: {
            type: "array",
            items: { type: "string" },
          },
        },
      },
      required: ["spreadsheetId", "range", "values"],
    },
  },
];

// Handle tool listing
server.listTools = async () => {
  return { tools };
};

// Handle tool execution
server.callTool = async (name, args) => {
  console.error(`Calling tool: ${name}`);
  
  try {
    switch (name) {
      case "list_sheets": {
        const drive = await getDrive();
        const response = await drive.files.list({
          q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
          fields: "files(id, name, modifiedTime)",
          orderBy: "modifiedTime desc",
          pageSize: 100,
        });

        const files = response.data.files || [];
        if (files.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No spreadsheets found. Make sure sheets are shared with: ${SERVICE_ACCOUNT}`,
              },
            ],
          };
        }

        const fileList = files
          .map(f => `• ${f.name}\n  ID: ${f.id}\n  Modified: ${f.modifiedTime}`)
          .join("\n\n");

        return {
          content: [
            {
              type: "text",
              text: `Found ${files.length} spreadsheet(s):\n\n${fileList}`,
            },
          ],
        };
      }

      case "read_sheet": {
        const sheets = await getSheets();
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId: args.spreadsheetId,
          range: args.range,
        });

        const values = response.data.values;
        if (!values || values.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "No data found in the specified range.",
              },
            ],
          };
        }

        const formatted = values.map(row => row.join(" | ")).join("\n");
        return {
          content: [
            {
              type: "text",
              text: `Data from ${args.range}:\n\n${formatted}`,
            },
          ],
        };
      }

      case "write_sheet": {
        const sheets = await getSheets();
        const response = await sheets.spreadsheets.values.append({
          spreadsheetId: args.spreadsheetId,
          range: args.range,
          valueInputOption: "USER_ENTERED",
          insertDataOption: "INSERT_ROWS",
          resource: {
            values: args.values,
          },
        });

        return {
          content: [
            {
              type: "text",
              text: `Successfully appended ${args.values.length} row(s).\nUpdated range: ${response.data.updates.updatedRange}`,
            },
          ],
        };
      }

      case "update_sheet": {
        const sheets = await getSheets();
        const response = await sheets.spreadsheets.values.update({
          spreadsheetId: args.spreadsheetId,
          range: args.range,
          valueInputOption: "USER_ENTERED",
          resource: {
            values: args.values,
          },
        });

        return {
          content: [
            {
              type: "text",
              text: `Successfully updated ${response.data.updatedCells} cell(s).\nRange: ${response.data.updatedRange}`,
            },
          ],
        };
      }

      default:
        return {
          content: [
            {
              type: "text",
              text: `Unknown tool: ${name}`,
            },
          ],
        };
    }
  } catch (error) {
    console.error(`Error in ${name}:`, error);
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error.message}\n\nMake sure the sheet is shared with: ${SERVICE_ACCOUNT}`,
        },
      ],
    };
  }
};

// Start server
app.listen(PORT, () => {
  console.log(`Google Sheets MCP server running on port ${PORT}`);
});
