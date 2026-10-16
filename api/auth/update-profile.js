
import {
  getUsers,
  updateUser,
  publicUser,
} from "../../lib/googleSheets.js";

import {
  getSession,
} from "../../lib/auth.js";

import {
  setCors,
  handleOptions,
  methodNotAllowed,
  getJsonBody,
} from "../../lib/http.js";

function normalize(value) {
  return String(value ?? "").trim();
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
        error: "Please sign in to update your profile.",
      });
    }

    const body = getJsonBody(req);

    const name = normalize(body.name);
    const username = normalize(body.username);

    if (!name || !username) {
      return res.status(400).json({
        error: "Name and username are required.",
      });
    }

    if (name.length > 80) {
      return res.status(400).json({
        error: "Name must be 80 characters or fewer.",
      });
    }

    if (username.length < 3 || username.length > 24) {
      return res.status(400).json({
        error: "Username must be between 3 and 24 characters.",
      });
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return res.status(400).json({
        error:
          "Username can contain only English letters, numbers, and underscores.",
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

    if (
      currentUser.status &&
      currentUser.status !== "active"
    ) {
      return res.status(403).json({
        error: "This account is not active.",
      });
    }

    const usernameTaken = users.some(
      (user) =>
        String(user.username).trim().toLowerCase() ===
          username.toLowerCase() &&
        String(user.username).trim().toLowerCase() !==
          String(currentUser.username).trim().toLowerCase()
    );

    if (usernameTaken) {
      return res.status(409).json({
        error: "This username is already taken.",
      });
    }

    const updatedUser = await updateUser(
      currentUser.username,
      {
        name,
        username,
      }
    );

    return res.status(200).json({
      message: "Profile updated successfully.",
      user: publicUser(updatedUser),
    });
  } catch (error) {
    console.error("Update profile error:", error.message);

    return res.status(500).json({
      error: "Unable to update your profile right now.",
    });
  }
}
