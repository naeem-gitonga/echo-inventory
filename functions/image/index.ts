import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { BedrockRuntimeClient, ConverseCommand, ContentBlock, Tool } from '@aws-sdk/client-bedrock-runtime';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { ulid } from 'ulid';
import { docClient, TABLE_NAME, getMembership, QueryCommand, PutCommand, UpdateCommand } from '../shared/db';
import { requireAuth, AuthError, errorResponse, okResponse } from '../shared/auth';
import { ProcessImageInput, InventoryToolInput } from '../shared/types';

const bedrockClient = new BedrockRuntimeClient({});
const s3Client      = new S3Client(
  process.env.LOCALSTACK_ENDPOINT ? { endpoint: process.env.LOCALSTACK_ENDPOINT } : {}
);
const MODEL_ID      = process.env.MODEL_ID!;
const BUCKET_NAME   = process.env.BUCKET_NAME!;

const UPDATE_INVENTORY_TOOL: Tool = {
  toolSpec: {
    name: 'update_inventory',
    description:
      'Update quantity of existing inventory items or add new ones based on what is visible in the image. ' +
      'Use a negative quantity_delta when items are being removed or consumed.',
    inputSchema: {
      json: {
        type: 'object',
        required: ['items'],
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              required: ['name', 'quantity_delta', 'unit', 'category'],
              properties: {
                name:           { type: 'string',  description: 'Item name, as specific as possible' },
                quantity_delta: { type: 'number',  description: 'Amount to add (positive) or remove (negative)' },
                unit:           { type: 'string',  enum: ['pcs', 'boxes', 'kg', 'liters', 'rolls', 'other'] },
                category:       { type: 'string',  enum: ['Food', 'Electronics', 'Tools', 'Office', 'Clothing', 'Household', 'Other'] },
              },
            },
          },
        },
      },
    },
  },
};

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  try {
    const isPublic = event.rawPath.startsWith('/public/');
    const orgId    = event.pathParameters?.orgId;
    if (!orgId) return errorResponse(400, 'Missing orgId');

    // Auth: public route needs no token; authenticated route requires membership
    if (!isPublic) {
      const auth = await requireAuth(event);
      const membership = await getMembership(orgId, auth.userId);
      if (!membership) return errorResponse(403, 'Forbidden');
    }

    if (!event.body) return errorResponse(400, 'Missing request body');
    const input = JSON.parse(event.body) as ProcessImageInput;
    if (!input.imageBase64 || !input.mimeType) {
      return errorResponse(400, 'imageBase64 and mimeType are required');
    }

    const result = await processImage(orgId, input, isPublic);
    return okResponse(result);
  } catch (err) {
    if (err instanceof AuthError) return errorResponse(err.statusCode, err.message);
    console.error(err);
    return errorResponse(500, 'Internal server error');
  }
}

// ── Core image processing ─────────────────────────────────────────────────────

async function processImage(orgId: string, input: ProcessImageInput, isPublic: boolean) {
  const imageBytes = Buffer.from(input.imageBase64, 'base64');
  const format     = input.mimeType.split('/')[1] as 'jpeg' | 'png' | 'webp' | 'gif';

  // Fetch current inventory so the AI can match exact item names and quantities
  const existing = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: { ':pk': `ORG#${orgId}`, ':sk': 'ITEM#' },
  }));
  const currentItems = (existing.Items ?? []).map(i =>
    `- "${i.name}" (${i.quantity} ${i.unit}, ${i.category})`
  ).join('\n');
  const inventoryContext = currentItems.length
    ? `\nCurrent inventory:\n${currentItems}\n\nAlways use the exact item name from the inventory list above when an item matches. Only create a new item if nothing in the inventory is a reasonable match.`
    : '\nThe inventory is currently empty. Create new items for everything you identify.';

  const systemPrompt = isPublic
    ? 'You are an inventory assistant for a community pantry. A visitor is taking items from the pantry and has submitted a photo of what they are taking. ' +
      'Use a NEGATIVE quantity_delta equal to the count of each item visible in the photo (e.g. one can = -1). ' +
      'Never use a positive quantity_delta in this context.' + inventoryContext
    : 'You are an inventory assistant. Analyze this image and identify all inventory items visible. ' +
      'Use a positive quantity_delta when items are being added and a negative quantity_delta when items are being removed. ' +
      'Call the update_inventory tool with every item you identify.' + inventoryContext;

  const userPrompt = isPublic
    ? 'I am taking these items from the pantry. Identify each item visible and subtract exactly the count shown from the inventory.'
    : 'Identify all inventory items in this image and update the inventory.';

  // Call Bedrock Converse API
  const response = await bedrockClient.send(new ConverseCommand({
    modelId: MODEL_ID,
    system: [{ text: systemPrompt }],
    messages: [{
      role: 'user',
      content: [
        { image: { format, source: { bytes: imageBytes } } } as ContentBlock,
        { text: userPrompt },
      ],
    }],
    toolConfig: { tools: [UPDATE_INVENTORY_TOOL] },
  }));

  // Extract tool call from response
  const toolUseBlock = response.output?.message?.content?.find(b => b.toolUse);
  if (!toolUseBlock?.toolUse) {
    return { updatedItems: [], createdItems: [], message: 'No items identified' };
  }

  const toolInput = toolUseBlock.toolUse.input as unknown as InventoryToolInput;

  // Apply updates to DynamoDB
  const { updatedItems, createdItems } = await applyInventoryUpdates(orgId, toolInput, isPublic);

  // Archive image to S3 (best-effort)
  const imageKey = `archive/${orgId}/${ulid()}.${format}`;
  await s3Client.send(new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key:    imageKey,
    Body:   imageBytes,
    ContentType: input.mimeType,
  })).catch(err => console.warn('S3 archive failed (non-fatal):', err));

  return { updatedItems, createdItems };
}

async function applyInventoryUpdates(orgId: string, toolInput: InventoryToolInput, isPublic: boolean) {
  // Fetch existing items for this org to match by name
  const existing = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: { ':pk': `ORG#${orgId}`, ':sk': 'ITEM#' },
  }));

  const itemsByName = new Map(
    (existing.Items ?? []).map(item => [item.name.toLowerCase(), item])
  );

  const updatedItems: Array<{ itemId: string; name: string; quantityDelta: number; newQuantity: number }> = [];
  const createdItems: Array<{ itemId: string; name: string; quantity: number }> = [];
  const now = new Date().toISOString();

  await Promise.all(
    toolInput.items.map(async ({ name, quantity_delta, unit, category }) => {
      // Public captures are always removals — clamp any positive AI delta to negative
      const delta = isPublic ? -Math.abs(quantity_delta) : quantity_delta;

      const existing = itemsByName.get(name.toLowerCase());

      if (existing) {
        const newQuantity = Math.max(0, existing.quantity + delta);
        await docClient.send(new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { PK: `ORG#${orgId}`, SK: `ITEM#${existing.itemId}` },
          UpdateExpression: 'SET quantity = :q, updatedAt = :u',
          ExpressionAttributeValues: { ':q': newQuantity, ':u': now },
        }));
        updatedItems.push({ itemId: existing.itemId, name, quantityDelta: delta, newQuantity });
      } else if (!isPublic) {
        // Public visitors can only take existing items — never create new inventory entries
        const itemId   = ulid();
        const quantity = Math.max(0, delta);
        await docClient.send(new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            PK: `ORG#${orgId}`,
            SK: `ITEM#${itemId}`,
            itemId,
            orgId,
            name,
            category,
            quantity,
            unit,
            aiIdentified: true,
            createdAt: now,
            updatedAt: now,
          },
        }));
        createdItems.push({ itemId, name, quantity });
      }
    })
  );

  return { updatedItems, createdItems };
}
