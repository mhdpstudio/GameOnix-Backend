
import { google } from "googleapis";

const HEADERS = [
  "username",
  "password_hash",
  "email",
  "name",
  "created_at",
  "comments",
  "likes",
  "favorites",
  "theme",
  "avatar",
  "status",
  "verification_code_hash",
  "verification_expires_at",
  "pending_expires_at",
  "reset_password_code_hash",
  "reset_password_expires_at",
  "reset_password_attempts",
  "pending_email",
  "email_change_code_hash",
  "email_change_expires_at",
];

function getSheetsClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let privateKey = process.env.GOOGLE_PRIVATE_KEY;

  if (!process.env.GOOGLE_SHEET_ID || !email || !privateKey) {
    throw new Error(
      "Google Sheets environment variables are not configured."
    );
  }

  privateKey = privateKey
    .replace(/\\n/g, "\n")
    .replace(/^"|"$/g, "");

  const auth = new google.auth.JWT({
    email,
    key: privateKey,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
    ],
  });

  return google.sheets({ version: "v4", auth });
}

function sheetRange() {
  const name = (process.env.GOOGLE_SHEET_NAME || "Sheet1")
    .replace(/'/g, "''");

  return `'${name}'!A:T`;
}

function serializeCell(header, value) {
  if (["comments", "likes", "favorites"].includes(header)) {
    return typeof value === "string"
      ? value
      : JSON.stringify(value ?? []);
  }

  if (header === "theme") return value || "dark";
  if (header === "reset_password_attempts") return value ?? "0";

  return value ?? "";
}

function userToRow(user) {
  return HEADERS.map((header) =>
    serializeCell(header, user[header])
  );
}

function parseJsonCell(value) {
  if (!value) return [];

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function validateHeaders(headers) {
  const missing = HEADERS.filter(
    (header) => !headers.includes(header)
  );

  if (missing.length) {
    throw new Error(
      `Google Sheet is missing required headers: ${missing.join(", ")}`
    );
  }
}

function parseRows(rows) {
  if (!rows.length) {
    throw new Error(
      "Google Sheet is empty. Add the required header row first."
    );
  }

  const headers = rows[0].map((header) =>
    String(header).trim()
  );

  validateHeaders(headers);

  return {
    headers,
    users: rows
      .slice(1)
      .filter((row) =>
        row.some((cell) => String(cell ?? "").trim())
      )
      .map((row) =>
        Object.fromEntries(
          headers.map((header, index) => [
            header,
            row[index] ?? "",
          ])
        )
      ),
  };
}

export async function getUsers() {
  const sheets = getSheetsClient();

  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: sheetRange(),
  });

  return parseRows(result.data.values || []).users;
}

export async function appendUser(user) {
  const sheets = getSheetsClient();

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: sheetRange(),
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [userToRow(user)],
    },
  });
}

export async function updateUser(username, updates) {
  const sheets = getSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;

  const result = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: sheetRange(),
  });

  const rows = result.data.values || [];
  const { headers } = parseRows(rows);

  const usernameIndex = headers.indexOf("username");

  const rowIndex = rows.findIndex(
    (row, index) =>
      index > 0 &&
      String(row[usernameIndex] || "").trim().toLowerCase() ===
      String(username).trim().toLowerCase()
  );

  if (rowIndex === -1) {
    throw new Error("User not found in Google Sheet.");
  }

  const currentRow = rows[rowIndex] || [];

  const currentUser = Object.fromEntries(
    headers.map((header, index) => [
      header,
      currentRow[index] ?? "",
    ])
  );

  const updatedUser = { ...currentUser, ...updates };

  const values = headers.map((header) =>
    serializeCell(header, updatedUser[header])
  );

  const sheetRow = rowIndex + 1;
  const escapedName = (
    process.env.GOOGLE_SHEET_NAME || "Sheet1"
  ).replace(/'/g, "''");

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${escapedName}'!A${sheetRow}:T${sheetRow}`,
    valueInputOption: "RAW",
    requestBody: {
      values: [values],
    },
  });

  return updatedUser;
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
    theme: user.theme || "dark",
    avatar:
      user.avatar ||
      "https://raw.githubusercontent.com/mhdpstudio/GameOnix-Data-All/main/0.png",
  };
}

