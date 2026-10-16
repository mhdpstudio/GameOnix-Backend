import { google } from "googleapis";

const HEADERS = [
  "username", "password_hash", "email", "name", "created_at",
  "comments", "likes", "favorites", "theme"
];

function getSheetsClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let privateKey = process.env.GOOGLE_PRIVATE_KEY;

  if (!process.env.GOOGLE_SHEET_ID || !email || !privateKey) {
    throw new Error("Google Sheets environment variables are not configured");
  }

  privateKey = privateKey.replace(/\\n/g, "\n").replace(/^"|"$/g, "");

  const auth = new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });

  return google.sheets({ version: "v4", auth });
}

function sheetRange() {
  const name = (process.env.GOOGLE_SHEET_NAME || "Sheet1").replace(/'/g, "''");
  return `'${name}'!A:I`;
}

export async function getUsers() {
  const sheets = getSheetsClient();
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: sheetRange()
  });

  const rows = result.data.values || [];
  if (!rows.length) {
    throw new Error("Google Sheet is empty. Add the required header row first.");
  }

  const headers = rows[0].map((h) => String(h).trim());
  const missing = HEADERS.filter((header) => !headers.includes(header));
  if (missing.length) {
    throw new Error(`Google Sheet is missing required headers: ${missing.join(", ")}`);
  }

  return rows.slice(1).filter((row) => row.some((cell) => String(cell ?? "").trim()))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
}

export async function appendUser(user) {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: sheetRange(),
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [[
        user.username,
        user.password_hash,
        user.email,
        user.name,
        user.created_at,
        JSON.stringify([]),
        JSON.stringify([]),
        JSON.stringify([]),
        "dark"
      ]]
    }
  });
}

export function publicUser(user) {
  return {
    username: user.username,
    email: user.email,
    name: user.name,
    created_at: user.created_at,
    comments: parseJsonCell(user.comments),
    likes: parseJsonCell(user.likes),
    favorites: parseJsonCell(user.favorites),
    theme: user.theme || "dark"
  };
}

function parseJsonCell(value) {
  if (!value) return [];
  try { return JSON.parse(value); } catch { return value; }
}
