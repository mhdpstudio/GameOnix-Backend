import jwt from "jsonwebtoken";

const COOKIE_NAME = "gameonix_session";
const SESSION_SECONDS = 60 * 60 * 24 * 7;

function cookieOptions(maxAge) {
  // Cross-origin frontend/API deployments require SameSite=None + Secure.
  // In local development, localhost HTTP needs a non-Secure cookie.
  const isProduction = process.env.VERCEL_ENV === "production";
  const sameSite = isProduction ? "None" : "Lax";
  const secure = isProduction ? "; Secure" : "";
  return `Path=/; HttpOnly; SameSite=${sameSite}${secure}; Max-Age=${maxAge}`;
}

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error("SESSION_SECRET must be set to at least 32 characters");
  }
  return value;
}

export function createSession(res, user, rememberMe = true) {
  const maxAge = rememberMe ? SESSION_SECONDS : 60 * 60 * 4;
  const token = jwt.sign(
    { username: user.username, email: user.email, name: user.name },
    secret(),
    { expiresIn: maxAge, issuer: "gameonix-api", audience: "gameonix-web" }
  );
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=${token}; ${cookieOptions(maxAge)}`);
  return token;
}

export function clearSession(res) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; ${cookieOptions(0)}`);
}

export function getSession(req) {
  const authorization = req.headers.authorization || "";
  const bearerMatch = authorization.match(/^Bearer\s+(.+)$/i);

  const cookieHeader = req.headers.cookie || "";
  const cookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`));

  const token = bearerMatch?.[1] || cookie?.slice(COOKIE_NAME.length + 1);

  if (!token) {
    console.log("[AUTH DEBUG] No session token received", {
      hasAuthorization: Boolean(authorization),
      hasCookie: Boolean(cookie),
    });
    return null;
  }

  try {
    const session = jwt.verify(token, secret(), {
      issuer: "gameonix-api",
      audience: "gameonix-web",
    });

    console.log("[AUTH DEBUG] Session verified", {
      hasUsername: Boolean(session?.username),
    });

    return session;
  } catch (error) {
    console.log("[AUTH DEBUG] Session verification failed", {
      reason: error.name,
      message: error.message,
    });

    return null;
  }
}

