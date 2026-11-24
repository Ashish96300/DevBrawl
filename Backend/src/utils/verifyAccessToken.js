import jwt from "jsonwebtoken";
import { ApiError } from "./apiError.js";

// .env.example historically documented JWT_SECRET / JWT_EXPIRY while the code
// read ACCESS_TOKEN_SECRET / ACCESS_TOKEN_EXPIRY. Accept both so a deploy with
// either naming works.
export const getAccessSecret = () =>
  process.env.ACCESS_TOKEN_SECRET || process.env.JWT_SECRET;

export const getAccessExpiry = () =>
  process.env.ACCESS_TOKEN_EXPIRY || process.env.JWT_EXPIRY || "7d";

/**
 * Verifies an access token and always fails with an ApiError(401), never a raw
 * jsonwebtoken error. A raw TokenExpiredError has no statusCode, which made the
 * error middleware answer 500 and kept the frontend 401 handler from firing.
 * `code` lets the client tell an expired token from an invalid one.
 */
export const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, getAccessSecret());
  } catch (err) {
    const expired = err?.name === "TokenExpiredError";
    const apiError = new ApiError(
      401,
      expired ? "Session expired. Please log in again." : "Invalid access token"
    );
    apiError.code = expired ? "TOKEN_EXPIRED" : "TOKEN_INVALID";
    throw apiError;
  }
};
