import { APIGatewayProxyEventV2, APIGatewayProxyResultV2, CognitoUserPoolTriggerEvent } from 'aws-lambda';
import { ulid } from 'ulid';
import { docClient, TABLE_NAME, QueryCommand, PutCommand } from '../shared/db';
import { okResponse, errorResponse } from '../shared/auth';

export async function handler(
  event: APIGatewayProxyEventV2 | CognitoUserPoolTriggerEvent
): Promise<APIGatewayProxyResultV2 | CognitoUserPoolTriggerEvent> {

  // ── Cognito post-confirmation trigger ──────────────────────────────────────
  if ('triggerSource' in event) {
    if (event.triggerSource !== 'PostConfirmation_ConfirmSignUp') return event;
    return handlePostConfirmation(event);
  }

  // ── API Gateway routes ─────────────────────────────────────────────────────
  const method = event.requestContext.http.method;
  const path   = event.rawPath;

  try {
    if (method === 'GET' && path === '/public/orgs') return await listOrgs();
    return errorResponse(404, 'Not found');
  } catch (err) {
    console.error(err);
    return errorResponse(500, 'Internal server error');
  }
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async function handlePostConfirmation(event: CognitoUserPoolTriggerEvent): Promise<CognitoUserPoolTriggerEvent> {
  const userId  = event.request.userAttributes.sub;
  const email   = event.request.userAttributes.email;
  const orgName = event.request.userAttributes['custom:orgName'] ?? 'My Organization';
  const orgId   = ulid();
  const now     = new Date().toISOString();

  await Promise.all([
    // Org metadata (GSI1 enables public listing)
    docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `ORG#${orgId}`,
        SK: 'METADATA',
        orgId,
        orgName,
        ownerId: userId,
        createdAt: now,
        entityType: 'ORG',
        GSI1PK: 'ORG',
        GSI1SK: now,
      },
    })),
    // Owner membership record
    docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `ORG#${orgId}`,
        SK: `MEMBER#${userId}`,
        userId,
        email,
        role: 'owner',
        addedAt: now,
        addedBy: userId,
      },
    })),
    // Reverse lookup: user → org
    docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `USER#${userId}`,
        SK: `ORG#${orgId}`,
        orgId,
        orgName,
        role: 'owner',
      },
    })),
  ]);

  return event;
}

async function listOrgs() {
  const result = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: 'GSI1',
    KeyConditionExpression: 'GSI1PK = :pk',
    ExpressionAttributeValues: { ':pk': 'ORG' },
  }));

  const orgs = (result.Items ?? []).map(item => ({
    orgId:     item.orgId,
    orgName:   item.orgName,
    createdAt: item.createdAt,
  }));

  return okResponse(orgs);
}
