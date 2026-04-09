import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { BedrockRuntimeClient, ConverseCommand, ContentBlock, Tool } from '@aws-sdk/client-bedrock-runtime';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { ulid } from 'ulid';
import { docClient, TABLE_NAME, getMembership, QueryCommand, PutCommand, UpdateCommand } from '../shared/db';
import { verifyAuth, AuthError, errorResponse, okResponse } from '../shared/auth';
import { ProcessImageInput, InventoryToolInput } from '../shared/types';

const bedrockClient = new BedrockRuntimeClient({});
const s3Client      = new S3Client({});
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
      const auth = await verifyAuth(event);
      if (!auth) return errorResponse(401, 'Unauthorized');
      const membership = await getMembership(orgId, auth.userId);
      if (!membership) return errorResponse(403, 'Forbidden');
    }

    if (!event.body) return errorResponse(400, 'Missing request body');
    const input = JSON.parse(event.body) as ProcessImageInput;
    if (!input.imageBase64 || !input.mimeType) {
      return errorResponse(400, 'imageBase64 and mimeType are required');
    }

    const result = await processImage(orgId, input);
    return okResponse(result);
  } catch (err) {
    if (err instanceof AuthError) return errorResponse(err.statusCode, err.message);
    console.error(err);
    return errorResponse(500, 'Internal server error');
  }
}

// ── Core image processing ─────────────────────────────────────────────────────

async function processImage(orgId: string, input: ProcessImageInput) {
  // Bedrock is not available locally — return a mock response for local dev
  if (process.env.IS_LOCAL === 'true') {
    return {
      updatedItems: [],
      createdItems: [{ itemId: ulid(), name: 'Mock Item (local)', quantity: 1 }],
      mock: true,
    };
  }

  const imageBytes = Buffer.from(input.imageBase64, 'base64');
  const format     = input.mimeType.split('/')[1] as 'jpeg' | 'png' | 'webp' | 'gif';

  // Call Bedrock Converse API
  const response = await bedrockClient.send(new ConverseCommand({
    modelId: MODEL_ID,
    system: [{
      text:
        'You are an inventory assistant. Analyze this image and identify all inventory items visible. ' +
        'Determine whether items are being added to or removed from inventory based on context. ' +
        'Call the update_inventory tool with every item you identify.',
    }],
    messages: [{
      role: 'user',
      content: [
        { image: { format, source: { bytes: imageBytes } } } as ContentBlock,
        { text: 'Identify all inventory items in this image and update the inventory.' },
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
  const { updatedItems, createdItems } = await applyInventoryUpdates(orgId, toolInput);

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

async function applyInventoryUpdates(orgId: string, toolInput: InventoryToolInput) {
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
      const existing = itemsByName.get(name.toLowerCase());

      if (existing) {
        // Update existing item quantity
        const newQuantity = Math.max(0, existing.quantity + quantity_delta);
        await docClient.send(new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { PK: `ORG#${orgId}`, SK: `ITEM#${existing.itemId}` },
          UpdateExpression: 'SET quantity = :q, updatedAt = :u',
          ExpressionAttributeValues: { ':q': newQuantity, ':u': now },
        }));
        updatedItems.push({ itemId: existing.itemId, name, quantityDelta: quantity_delta, newQuantity });
      } else {
        // Create new item
        const itemId  = ulid();
        const quantity = Math.max(0, quantity_delta);
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
