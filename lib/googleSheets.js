
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

  return `'${name}'!A:N`;
}

function userToRow(user) {
  return [
    user.username || "",
    user.password_hash || "",
    user.email || "",
    user.name || "",
    user.created_at || "",
    typeof user.comments === "string"
      ? user.comments
      : JSON.stringify(user.comments ?? []),
    typeof user.likes === "string"
      ? user.likes
      : JSON.stringify(user.likes ?? []),
    typeof user.favorites === "string"
      ? user.favorites
      : JSON.stringify(user.favorites ?? []),
    user.theme || "dark",
    user.avatar || "",
    user.status || "",
    user.verification_code_hash || "",
    user.verification_expires_at || "",
    user.pending_expires_at || "",
  ];
}

export async function getUsers() {
  const sheets = getSheetsClient();

  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: sheetRange(),
  });

  const rows = result.data.values || [];

  if (!rows.length) {
    throw new Error(
      "Google Sheet is empty. Add the required header row first."
    );
  }

  const headers = rows[0].map((header) => String(header).trim());
  const missing = HEADERS.filter(
    (header) => !headers.includes(header)
  );

  if (missing.length) {
    throw new Error(
      `Google Sheet is missing required headers: ${missing.join(", ")}`
    );
  }

  return rows
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
    );
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

  if (!rows.length) {
    throw new Error("Google Sheet has no header row.");
  }

  const headers = rows[0].map((header) => String(header).trim());

  const missing = HEADERS.filter(
    (header) => !headers.includes(header)
  );

  if (missing.length) {
    throw new Error(
      `Google Sheet is missing required headers: ${missing.join(", ")}`
    );
  }

  const usernameIndex = headers.indexOf("username");

  const rowIndex = rows.findIndex(
    (row, index) =>
      index > 0 &&
      String(row[usernameIndex] || "").toLowerCase() ===
        String(username).toLowerCase()
  );

  if (rowIndex === -1) {
    throw new Error("User not found in Google Sheet.");
  }

  const currentRow = rows[rowIndex] || [];
  const user = Object.fromEntries(
    headers.map((header, index) => [
      header,
      currentRow[index] ?? "",
    ])
  );

  const updatedUser = { ...user, ...updates };
  const values = headers.map(
    (header) => updatedUser[header] ?? ""
  );

  // rowIndex is zero-based in the returned array.
  // The spreadsheet row number is rowIndex + 1.
  const sheetRow = rowIndex + 1;
  const escapedName = (
    process.env.GOOGLE_SHEET_NAME || "Sheet1"
  ).replace(/'/g, "''");

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${escapedName}'!A${sheetRow}:N${sheetRow}`,
    valueInputOption: "RAW",
    requestBody: {
      values: [HEADERS.map((header) => updatedUser[header] ?? "")],
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
    avatar: user.avatar || "",
  };
}

function parseJsonCell(value) {
  if (!value) return [];

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
