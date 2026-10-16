
import { randomUUID } from "node:crypto";

import {
  getUsers,
  updateUser,
  publicUser,
} from "../../lib/googleSheets.js";

import { getSession } from "../../lib/auth.js";

import {
  setCors,
  handleOptions,
  methodNotAllowed,
  getJsonBody,
} from "../../lib/http.js";

const MAX_FILE_SIZE = 2 * 1024 * 1024;

const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || "main";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

function detectImage(buffer) {
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    )
  ) {
    return { mime: "image/png", ext: "png" };
  }

  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return { mime: "image/jpeg", ext: "jpg" };
  }

  if (
    buffer.length >= 6 &&
    ["GIF87a", "GIF89a"].includes(buffer.toString("ascii", 0, 6))
  ) {
    return { mime: "image/gif", ext: "gif" };
  }

  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return { mime: "image/webp", ext: "webp" };
  }

  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 4, 8) === "ftyp" &&
    ["avif", "avis"].includes(buffer.toString("ascii", 8, 12))
  ) {
    return { mime: "image/avif", ext: "avif" };
  }

  return null;
}

export default async function handler(req, res) {
  setCors(req, res);

  if (handleOptions(req, res)) return;

  if (req.method !== "POST") {
    return methodNotAllowed(res, ["POST", "OPTIONS"]);
  }

  try {
    const session = getSession(req);

    if (!session?.username) {
      return res.status(401).json({
        error: "Please sign in to upload an avatar.",
      });
    }

    if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
      console.error("Avatar upload environment variables are missing.");

      return res.status(500).json({
        error: "Avatar uploads are not configured.",
      });
    }

    const users = await getUsers();

    const currentUser = users.find(
      (user) =>
        String(user.username).trim().toLowerCase() ===
        String(session.username).trim().toLowerCase()
    );

    if (!currentUser) {
      return res.status(404).json({
        error: "Your account could not be found.",
      });
    }

    if (currentUser.status && currentUser.status !== "active") {
      return res.status(403).json({
        error: "This account is not active.",
      });
    }

    const body = getJsonBody(req);
    const base64 = String(body?.imageData ?? "");

    if (
      !base64 ||
      base64.length > Math.ceil(MAX_FILE_SIZE * 4 / 3) + 16 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(base64) ||
      base64.length % 4 !== 0
    ) {
      return res.status(400).json({
        error: "Invalid image data or image is too large. Maximum size is 2 MB.",
      });
    }

    const imageBuffer = Buffer.from(base64, "base64");

    if (
      imageBuffer.length === 0 ||
      imageBuffer.length > MAX_FILE_SIZE ||
      imageBuffer.toString("base64") !== base64
    ) {
      return res.status(400).json({
        error: "Invalid image data or image is too large. Maximum size is 2 MB.",
      });
    }

    const detected = detectImage(imageBuffer);

    if (!detected) {
      return res.status(415).json({
        error: "Supported formats are PNG, JPG, WEBP, GIF, and AVIF.",
      });
    }

    const suppliedMime = String(body?.mimeType ?? "").toLowerCase();

    if (suppliedMime && suppliedMime !== detected.mime) {
      return res.status(415).json({
        error: "The image format does not match the file content.",
      });
    }

    const safeUsername = String(currentUser.username)
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "_");

    const fileName = `${safeUsername}-${randomUUID()}.${detected.ext}`;
    const path = `avatars/${fileName}`;

    const githubResponse = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(GITHUB_OWNER)}/${encodeURIComponent(GITHUB_REPO)}/contents/${path.split("/").map(encodeURIComponent).join("/")}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({
          message: `Upload avatar for ${safeUsername}`,
          content: imageBuffer.toString("base64"),
          branch: GITHUB_BRANCH,
        }),
      }
    );

    if (!githubResponse.ok) {
      const details = await githubResponse.text();

      console.error(
        "GitHub avatar upload failed:",
        githubResponse.status,
        details.slice(0, 500)
      );

      return res.status(502).json({
        error: "Unable to upload the image to the image repository.",
      });
    }

    const avatarUrl =
      `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${path}`;

    const updatedUser = await updateUser(currentUser.username, {
      avatar: avatarUrl,
    });

    return res.status(200).json({
      message: "Avatar uploaded successfully.",
      avatar: avatarUrl,
      user: publicUser(updatedUser),
    });
  } catch (error) {
    console.error("Avatar upload error:", error.message);

    return res.status(500).json({
      error: "Unable to upload your avatar right now.",
    });
  }
}
