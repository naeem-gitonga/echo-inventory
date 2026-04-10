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

/**
 * Extracts the authenticated user from the request.
 *
 * In production: API Gateway JWT authorizer has already validated the id_token
 * and injected claims into event.requestContext.authorizer.jwt.claims.
 *
 * In local dev (serverless-offline): no JWT authorizer, so we accept any
 * Bearer token value as the userId (set by the Next.js proxy from the id_token cookie).
 */
export async function requireAuth(event: APIGatewayProxyEventV2): Promise<AuthContext> {
  // Production — read from JWT authorizer claims
  const claims = (event.requestContext as any).authorizer?.jwt?.claims;
  if (claims?.sub) {
    return { userId: claims.sub, email: claims.email ?? '' };
  }

  // Local dev — accept any Bearer token
  if (process.env.IS_LOCAL === 'true') {
    const header = event.headers?.['authorization'] ?? event.headers?.['Authorization'] ?? '';
    const token  = header.startsWith('Bearer ') ? header.slice(7) : header;
    if (token) {
      // Decode id_token payload if it looks like a JWT, otherwise use as raw userId
      if (token.includes('.')) {
        try {
          const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
          return { userId: payload.sub ?? token, email: payload.email ?? `${token}@local.dev` };
        } catch { /* fall through */ }
      }
      return { userId: token, email: `${token}@local.dev` };
    }
  }

  throw new AuthError(401, 'Unauthorized');
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
