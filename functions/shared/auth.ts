import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { APIGatewayProxyEventV2 } from 'aws-lambda';

export interface AuthContext {
  userId: string;
  email:  string;
}

export class AuthError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

// Verifier is created once per cold start and reuses its JWKS cache.
// Not initialised in local mode — Cognito is not running locally.
const verifier = process.env.IS_LOCAL !== 'true'
  ? CognitoJwtVerifier.create({
      userPoolId: process.env.USER_POOL_ID!,
      clientId:   process.env.USER_POOL_CLIENT_ID!,
      tokenUse:   'access',
    })
  : null;

/**
 * Verifies the JWT in the Authorization header.
 * Returns AuthContext on success, null if no token is present.
 * Throws AuthError if a token is present but invalid/expired.
 */
export async function verifyAuth(event: APIGatewayProxyEventV2): Promise<AuthContext | null> {
  const header = event.headers?.['authorization'] ?? event.headers?.['Authorization'];
  if (!header) return null;

  // Local dev — any Authorization header is accepted; userId comes from header value
  // e.g. Authorization: Bearer local-user-001
  if (process.env.IS_LOCAL === 'true') {
    const token = header.startsWith('Bearer ') ? header.slice(7) : header;
    return { userId: token, email: `${token}@local.dev` };
  }

  const token   = header.startsWith('Bearer ') ? header.slice(7) : header;
  const payload = await verifier!.verify(token);
  return { userId: payload.sub, email: (payload.email as string) ?? '' };
}

/**
 * Requires a valid JWT. Throws AuthError 401 if missing or invalid.
 */
export async function requireAuth(event: APIGatewayProxyEventV2): Promise<AuthContext> {
  const ctx = await verifyAuth(event);
  if (!ctx) throw new AuthError(401, 'Unauthorized');
  return ctx;
}

export function errorResponse(statusCode: number, message: string) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: message }),
  };
}

export function okResponse(body: unknown, statusCode = 200) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
