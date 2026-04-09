import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { ulid } from 'ulid';
import { docClient, TABLE_NAME, getMembership, QueryCommand, PutCommand, UpdateCommand, DeleteCommand, GetCommand } from '../shared/db';
import { requireAuth, AuthError, errorResponse, okResponse } from '../shared/auth';
import { CreateItemInput, UpdateItemInput } from '../shared/types';

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  try {
    const auth   = await requireAuth(event);
    const method = event.requestContext.http.method;
    const params = event.pathParameters ?? {};
    const orgId  = params.orgId!;
    const itemId = params.itemId;

    // Verify caller is a member of this org
    const membership = await getMembership(orgId, auth.userId);
    if (!membership) return errorResponse(403, 'Forbidden');

    if (method === 'GET'    && !itemId) return await listItems(orgId);
    if (method === 'POST'   && !itemId) return await createItem(orgId, auth.userId, event.body);
    if (method === 'PATCH'  &&  itemId) return await updateItem(orgId, itemId, event.body);
    if (method === 'DELETE' &&  itemId) return await deleteItem(orgId, itemId);

    return errorResponse(404, 'Not found');
  } catch (err) {
    if (err instanceof AuthError) return errorResponse(err.statusCode, err.message);
    console.error(err);
    return errorResponse(500, 'Internal server error');
  }
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async function listItems(orgId: string) {
  const result = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: {
      ':pk': `ORG#${orgId}`,
      ':sk': 'ITEM#',
    },
  }));
  return okResponse(result.Items ?? []);
}

async function createItem(orgId: string, userId: string, body: string | null | undefined) {
  if (!body) return errorResponse(400, 'Missing request body');
  const input = JSON.parse(body) as CreateItemInput;

  if (!input.name || !input.category || input.quantity == null || !input.unit) {
    return errorResponse(400, 'name, category, quantity, and unit are required');
  }

  const itemId = ulid();
  const now    = new Date().toISOString();

  const item = {
    PK: `ORG#${orgId}`,
    SK: `ITEM#${itemId}`,
    itemId,
    orgId,
    name:     input.name,
    category: input.category,
    quantity: input.quantity,
    unit:     input.unit,
    notes:    input.notes,
    aiIdentified: false,
    createdAt: now,
    updatedAt: now,
  };

  await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
  return okResponse(item, 201);
}

async function updateItem(orgId: string, itemId: string, body: string | null | undefined) {
  if (!body) return errorResponse(400, 'Missing request body');
  const input = JSON.parse(body) as UpdateItemInput;

  const existing = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: `ORG#${orgId}`, SK: `ITEM#${itemId}` },
  }));
  if (!existing.Item) return errorResponse(404, 'Item not found');

  const updates: string[] = [];
  const values: Record<string, unknown> = { ':updatedAt': new Date().toISOString() };

  if (input.name     !== undefined) { updates.push('name = :name');         values[':name']     = input.name; }
  if (input.category !== undefined) { updates.push('category = :category'); values[':category'] = input.category; }
  if (input.quantity !== undefined) { updates.push('quantity = :quantity'); values[':quantity'] = input.quantity; }
  if (input.unit     !== undefined) { updates.push('unit = :unit');         values[':unit']     = input.unit; }
  if (input.notes    !== undefined) { updates.push('notes = :notes');       values[':notes']    = input.notes; }

  if (updates.length === 0) return errorResponse(400, 'No fields to update');

  const result = await docClient.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { PK: `ORG#${orgId}`, SK: `ITEM#${itemId}` },
    UpdateExpression: `SET ${updates.join(', ')}, updatedAt = :updatedAt`,
    ExpressionAttributeValues: values,
    ReturnValues: 'ALL_NEW',
  }));

  return okResponse(result.Attributes);
}

async function deleteItem(orgId: string, itemId: string) {
  const existing = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: `ORG#${orgId}`, SK: `ITEM#${itemId}` },
  }));
  if (!existing.Item) return errorResponse(404, 'Item not found');

  await docClient.send(new DeleteCommand({
    TableName: TABLE_NAME,
    Key: { PK: `ORG#${orgId}`, SK: `ITEM#${itemId}` },
  }));

  return okResponse({ deleted: true });
}
