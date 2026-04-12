import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { ulid } from 'ulid';
import { docClient, TABLE_NAME, PutCommand } from '../shared/db';
import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  ConfirmSignUpCommand,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
  NotAuthorizedException,
  UsernameExistsException,
  CodeMismatchException,
  ExpiredCodeException,
  UserNotFoundException,
  InvalidPasswordException,
} from '@aws-sdk/client-cognito-identity-provider';

const cognito = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
const CLIENT_ID = process.env.USER_POOL_CLIENT_ID!;
const IS_LOCAL  = process.env.IS_LOCAL === 'true';

// ── Cookie helpers ─────────────────────────────────────────────────────────────

function parseCookies(header: string): Record<string, string> {
  return Object.fromEntries(
    header.split(';')
      .map(c => c.trim().split('='))
      .filter(p => p.length >= 2)
      .map(([k, ...v]) => {
        try { return [k.trim(), decodeURIComponent(v.join('=').trim())]; }
        catch { return [k.trim(), v.join('=').trim()]; }
      })
  );
}

// ── Response helpers ───────────────────────────────────────────────────────────

function ok(body: unknown, cookies?: string[]): APIGatewayProxyResultV2 {
  return { statusCode: 200, cookies, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function err(statusCode: number, message: string): APIGatewayProxyResultV2 {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: message }) };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext.http.method;
  const rawPath = event.rawPath;
  const path = '/' + rawPath.split('/').slice(rawPath.startsWith('/dev/') ? 2 : 1).join('/');
  const body = event.body ? JSON.parse(event.body) : {};
  const cookieHeader = event.headers?.cookie ?? event.headers?.Cookie ?? '';
  const cookies = parseCookies(cookieHeader);

  try {
    // ── POST /auth/signup ─────────────────────────────────────────────────────
    if (method === 'POST' && path === '/auth/signup') {
      const { email, password, orgName } = body;
      try {
        await cognito.send(new SignUpCommand({
          ClientId: CLIENT_ID,
          Username: email,
          Password: password,
          UserAttributes: [
            { Name: 'email',          Value: email },
            { Name: 'custom:orgName', Value: orgName ?? 'My Organization' },
          ],
        }));
      } catch (e: unknown) {
        if (e instanceof UsernameExistsException) {
          return err(409, 'An account with this email already exists');
        }
        if (e instanceof InvalidPasswordException) {
          return err(400, 'Password must be at least 8 characters and include uppercase, lowercase, and a number');
        }
        console.error('SignUp Cognito error:', JSON.stringify(e, null, 2));
        throw e;
      }
      return ok({ message: 'Confirmation code sent' });
    }

    // ── POST /auth/confirm ────────────────────────────────────────────────────
    if (method === 'POST' && path === '/auth/confirm') {
      const { email, code, password, orgName } = body;
      await cognito.send(new ConfirmSignUpCommand({
        ClientId: CLIENT_ID,
        Username: email,
        ConfirmationCode: code,
      }));

      // In local dev the Cognito post-confirmation trigger fires on AWS and writes
      // to real DynamoDB — not LocalStack. Simulate it here instead.
      if (IS_LOCAL && password && orgName) {
        const authRes = await cognito.send(new InitiateAuthCommand({
          ClientId: CLIENT_ID,
          AuthFlow: 'USER_PASSWORD_AUTH',
          AuthParameters: { USERNAME: email, PASSWORD: password },
        }));
        const idToken = authRes.AuthenticationResult?.IdToken;
        if (idToken) {
          const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString());
          const userId  = payload.sub as string;
          const orgId   = ulid();
          const now     = new Date().toISOString();
          await Promise.all([
            docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: { PK: `ORG#${orgId}`, SK: 'METADATA', orgId, orgName, ownerId: userId, createdAt: now, entityType: 'ORG', GSI1PK: 'ORG', GSI1SK: now } })),
            docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: { PK: `ORG#${orgId}`, SK: `MEMBER#${userId}`, userId, email, role: 'owner', addedAt: now, addedBy: userId } })),
            docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: { PK: `USER#${userId}`, SK: `ORG#${orgId}`, orgId, orgName, role: 'owner' } })),
          ]);
        }
      }

      return ok({ message: 'Email confirmed' });
    }

    // ── POST /auth/login ──────────────────────────────────────────────────────
    if (method === 'POST' && path === '/auth/login') {
      const { email, password } = body;
      const res = await cognito.send(new InitiateAuthCommand({
        ClientId: CLIENT_ID,
        AuthFlow: 'USER_PASSWORD_AUTH',
        AuthParameters: { USERNAME: email, PASSWORD: password },
      }));
      if (res.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
        return ok({ challenge: 'NEW_PASSWORD_REQUIRED', session: res.Session });
      }
      const { IdToken, RefreshToken } = res.AuthenticationResult!;
      return ok({ message: 'Signed in', idToken: IdToken!, refreshToken: RefreshToken! });
    }

    // ── POST /auth/set-password ───────────────────────────────────────────────
    if (method === 'POST' && path === '/auth/set-password') {
      const { email, newPassword, session } = body;
      const res = await cognito.send(new RespondToAuthChallengeCommand({
        ClientId: CLIENT_ID,
        ChallengeName: 'NEW_PASSWORD_REQUIRED',
        Session: session,
        ChallengeResponses: { USERNAME: email, NEW_PASSWORD: newPassword },
      }));
      const { IdToken, RefreshToken } = res.AuthenticationResult!;
      return ok({ message: 'Password set', idToken: IdToken!, refreshToken: RefreshToken! });
    }

    // ── POST /auth/refresh ────────────────────────────────────────────────────
    if (method === 'POST' && path === '/auth/refresh') {
      const refreshToken = cookies['refresh_token'];
      if (!refreshToken) return err(401, 'No refresh token');
      const res = await cognito.send(new InitiateAuthCommand({
        ClientId: CLIENT_ID,
        AuthFlow: 'REFRESH_TOKEN_AUTH',
        AuthParameters: { REFRESH_TOKEN: refreshToken },
      }));
      const { IdToken } = res.AuthenticationResult!;
      return ok({ message: 'Refreshed', idToken: IdToken! });
    }

    // ── POST /auth/logout ─────────────────────────────────────────────────────
    if (method === 'POST' && path === '/auth/logout') {
      return ok({ message: 'Signed out' });
    }

    // ── GET /auth/me ──────────────────────────────────────────────────────────
    if (method === 'GET' && path === '/auth/me') {
      const authHeader = event.headers?.authorization ?? event.headers?.Authorization ?? '';
      const idToken = cookies['id_token'] || (authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '');
      if (!idToken) return err(401, 'Not authenticated');
      // Decode payload — token was issued by Cognito so we trust it here;
      // the API Gateway JWT authorizer validates signatures on protected routes.
      const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString());
      if (payload.exp < Math.floor(Date.now() / 1000)) return err(401, 'Token expired');
      return ok({ userId: payload.sub, email: payload.email, orgName: payload['custom:orgName'] });
    }

    return err(404, 'Not found');

  } catch (e: unknown) {
    if (e instanceof NotAuthorizedException)  return err(401, 'Incorrect email or password');
    if (e instanceof UserNotFoundException)   return err(401, 'Incorrect email or password');
    if (e instanceof UsernameExistsException) return err(409, 'An account with this email already exists');
    if (e instanceof CodeMismatchException)   return err(400, 'Invalid verification code');
    if (e instanceof ExpiredCodeException)    return err(400, 'Verification code has expired');
    console.error(e);
    return err(500, 'Internal server error');
  }
}
