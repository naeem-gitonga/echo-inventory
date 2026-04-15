import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { docClient, TABLE_NAME, GetCommand, QueryCommand } from '../shared/db';
import { okResponse, errorResponse, requireAuth, AuthError } from '../shared/auth';

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext.http.method;
  // Strip stage prefix added by serverless-offline (e.g. /dev/orgs → /orgs)
  const path = '/' + event.rawPath.split('/').slice(event.rawPath.startsWith('/dev/') ? 2 : 1).join('/');

  const publicOrgMatch       = path.match(/^\/public\/orgs\/([^/]+)$/);
  const publicInventoryMatch = path.match(/^\/public\/orgs\/([^/]+)\/inventory$/);

  try {
    if (method === 'GET' && path === '/public/orgs')     return await listOrgs();
    if (method === 'GET' && publicOrgMatch)              return await getOrg(publicOrgMatch[1]);
    if (method === 'GET' && publicInventoryMatch)        return await listPublicInventory(publicInventoryMatch[1]);
    if (method === 'GET' && path === '/orgs')            return await listMyOrgs(event);
    return errorResponse(404, 'Not found');
  } catch (err) {
    if (err instanceof AuthError) return errorResponse(err.statusCode, err.message);
    console.error(err);
    return errorResponse(500, 'Internal server error');
  }
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async function listMyOrgs(event: APIGatewayProxyEventV2) {
  const auth = await requireAuth(event);

  const result = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: {
      ':pk': `USER#${auth.userId}`,
      ':sk': 'ORG#',
    },
  }));

  const orgs = (result.Items ?? []).map(item => ({
    orgId:   item.orgId,
    orgName: item.orgName,
    role:    item.role,
  }));

  return okResponse(orgs);
}

async function getOrg(orgId: string) {
  const result = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: `ORG#${orgId}`, SK: 'METADATA' },
  }));
  if (!result.Item) return errorResponse(404, 'Pantry not found');
  const item = result.Item;
  return okResponse({ orgId: item.orgId, orgName: item.orgName, createdAt: item.createdAt });
}

async function listPublicInventory(orgId: string) {
  const [orgResult, itemsResult] = await Promise.all([
    docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `ORG#${orgId}`, SK: 'METADATA' },
    })),
    docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: { ':pk': `ORG#${orgId}`, ':sk': 'ITEM#' },
    })),
  ]);
  if (!orgResult.Item) return errorResponse(404, 'Pantry not found');
  const items = (itemsResult.Items ?? []).map(i => ({
    itemId: i.itemId, name: i.name, category: i.category,
    quantity: i.quantity, unit: i.unit, brand: i.brand, notes: i.notes,
  }));
  return okResponse(items);
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
