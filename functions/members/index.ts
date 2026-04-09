import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { CognitoIdentityProviderClient, AdminCreateUserCommand, AdminCreateUserCommandInput } from '@aws-sdk/client-cognito-identity-provider';
import { docClient, TABLE_NAME, getMembership, QueryCommand, PutCommand, DeleteCommand } from '../shared/db';
import { requireAuth, AuthError, errorResponse, okResponse } from '../shared/auth';
import { AddMemberInput } from '../shared/types';

const cognitoClient = new CognitoIdentityProviderClient({});
const USER_POOL_ID  = process.env.USER_POOL_ID!;

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  try {
    const auth   = await requireAuth(event);
    const method = event.requestContext.http.method;
    const params = event.pathParameters ?? {};
    const orgId  = params.orgId!;
    const userId = params.userId;

    // Verify caller is a member of this org
    const membership = await getMembership(orgId, auth.userId);
    if (!membership) return errorResponse(403, 'Forbidden');

    if (method === 'GET'    && !userId) return await listMembers(orgId);
    if (method === 'POST'   && !userId) return await addMember(orgId, auth.userId, membership.role, event.body);
    if (method === 'DELETE' &&  userId) return await removeMember(orgId, auth.userId, membership.role, userId);

    return errorResponse(404, 'Not found');
  } catch (err) {
    if (err instanceof AuthError) return errorResponse(err.statusCode, err.message);
    console.error(err);
    return errorResponse(500, 'Internal server error');
  }
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async function listMembers(orgId: string) {
  const result = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: {
      ':pk': `ORG#${orgId}`,
      ':sk': 'MEMBER#',
    },
  }));

  const members = (result.Items ?? []).map(item => ({
    userId:   item.userId,
    email:    item.email,
    role:     item.role,
    addedAt:  item.addedAt,
  }));

  return okResponse(members);
}

async function addMember(orgId: string, callerId: string, callerRole: string, body: string | null | undefined) {
  if (callerRole !== 'owner') return errorResponse(403, 'Only org owners can add members');
  if (!body) return errorResponse(400, 'Missing request body');

  const input = JSON.parse(body) as AddMemberInput;
  if (!input.email) return errorResponse(400, 'email is required');

  // Create user in Cognito — sends temp password email automatically
  const params: AdminCreateUserCommandInput = {
    UserPoolId: USER_POOL_ID,
    Username:   input.email,
    UserAttributes: [{ Name: 'email', Value: input.email }, { Name: 'email_verified', Value: 'true' }],
    DesiredDeliveryMediums: ['EMAIL'],
  };

  const cognitoResult = await cognitoClient.send(new AdminCreateUserCommand(params));
  const newUserId = cognitoResult.User?.Attributes?.find(a => a.Name === 'sub')?.Value;
  if (!newUserId) return errorResponse(500, 'Failed to create user');

  const now = new Date().toISOString();

  await Promise.all([
    docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `ORG#${orgId}`,
        SK: `MEMBER#${newUserId}`,
        userId: newUserId,
        email:  input.email,
        role:   'member',
        addedAt: now,
        addedBy: callerId,
      },
    })),
    docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `USER#${newUserId}`,
        SK: `ORG#${orgId}`,
        orgId,
        role: 'member',
      },
    })),
  ]);

  return okResponse({ userId: newUserId, email: input.email, role: 'member' }, 201);
}

async function removeMember(orgId: string, callerId: string, callerRole: string, targetUserId: string) {
  if (callerRole !== 'owner') return errorResponse(403, 'Only org owners can remove members');
  if (targetUserId === callerId) return errorResponse(400, 'Cannot remove yourself');

  const membership = await getMembership(orgId, targetUserId);
  if (!membership) return errorResponse(404, 'Member not found');
  if (membership.role === 'owner') return errorResponse(400, 'Cannot remove the org owner');

  await Promise.all([
    docClient.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: `ORG#${orgId}`, SK: `MEMBER#${targetUserId}` },
    })),
    docClient.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: `USER#${targetUserId}`, SK: `ORG#${orgId}` },
    })),
  ]);

  return okResponse({ removed: true });
}
