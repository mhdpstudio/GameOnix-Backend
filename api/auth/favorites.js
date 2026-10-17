import { getUsers, updateUser, publicUser } from "../../lib/googleSheets.js";
import { getSession } from "../../lib/auth.js";
import {
  setCors,
  handleOptions,
  methodNotAllowed,
  getJsonBody,
} from "../../lib/http.js";

function parseFavorites(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default async function handler(req, res) {
  setCors(req, res);

  if (handleOptions(req, res)) return;

  if (!["GET", "POST", "DELETE"].includes(req.method)) {
    return methodNotAllowed(res, ["GET", "POST", "DELETE", "OPTIONS"]);
  }

  try {
    const session = getSession(req);

    if (!session?.username) {
      return res.status(401).json({
        error: "Please log in to manage favorites.",
      });
    }

    const users = await getUsers();
    const user = users.find(
      (item) =>
        item.username?.toLowerCase() === session.username.toLowerCase()
    );

    if (!user) {
      return res.status(401).json({ error: "User not found." });
    }

    const favorites = parseFavorites(user.favorites);

    if (req.method === "GET") {
      return res.status(200).json({ favorites });
    }

    const { slug } = getJsonBody(req);

    if (
      typeof slug !== "string" ||
      !slug.trim() ||
      slug.length > 200
    ) {
      return res.status(400).json({ error: "Invalid game slug." });
    }

    const normalizedSlug = slug.trim();
    let updatedFavorites;

    if (req.method === "POST") {
      updatedFavorites = favorites.includes(normalizedSlug)
        ? favorites
        : [...favorites, normalizedSlug];
    } else {
      updatedFavorites = favorites.filter(
        (favorite) => favorite !== normalizedSlug
      );
    }

    const updatedUser = await updateUser(user.username, {
      favorites: JSON.stringify(updatedFavorites),
    });

    if (!updatedUser) {
      return res.status(500).json({
        error: "Could not update favorites.",
      });
    }

    return res.status(200).json({
      favorites: updatedFavorites,
    });
  } catch (error) {
    console.error("Favorites API error:", error);

    return res.status(500).json({
      error: "An unexpected error occurred.",
    });
  }
}
