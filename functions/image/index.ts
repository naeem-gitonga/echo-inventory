import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { BedrockRuntimeClient, ConverseCommand, ContentBlock, Tool } from '@aws-sdk/client-bedrock-runtime';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { ulid } from 'ulid';
import { docClient, TABLE_NAME, getMembership, QueryCommand, PutCommand, UpdateCommand } from '../shared/db';
import { requireAuth, AuthError, errorResponse, okResponse } from '../shared/auth';
import { ProcessImageInput, InventoryToolInput } from '../shared/types';

const bedrockClient = new BedrockRuntimeClient({});
const s3Client      = new S3Client(
  process.env.LOCALSTACK_ENDPOINT
    ? { endpoint: process.env.LOCALSTACK_ENDPOINT, forcePathStyle: true }
    : {}
);
const MODEL_ID  = process.env.MODEL_ID!;
const BUCKET_NAME = process.env.BUCKET_NAME!;

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
                item_id:        { type: 'string',  description: 'The id of the matching inventory item. Include this when the item matches an existing inventory entry.' },
                name:           { type: 'string',  description: 'Item name exactly as it appears in the inventory list, or a new name if not in inventory' },
                quantity_delta: { type: 'number',  description: 'Amount to add (positive) or remove (negative)' },
                unit:           { type: 'string',  enum: ['pcs', 'boxes', 'kg', 'liters', 'rolls', 'other', 'units'] },
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

  // Fetch current inventory and pass full details to the LLM so it can identify the correct item
  const inventoryResult = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: { ':pk': `ORG#${orgId}`, ':sk': 'ITEM#' },
  }));
  const inventoryItems = inventoryResult.Items ?? [];

  const currentItems = inventoryItems.map(i => {
    const parts = [`id: ${i.itemId}`, `qty: ${i.quantity} ${i.unit}`, `category: ${i.category}`];
    if (i.brand) parts.push(`brand: ${i.brand}`);
    if (i.notes) parts.push(`notes: ${i.notes}`);
    return `- "${i.name}" (${parts.join(', ')})`;
  }).join('\n');

  const inventoryContext = currentItems.length
    ? `\nCurrent inventory:\n${currentItems}\n\nWhen an item in the image matches an inventory entry, include its "id" as the item_id in the tool call. Choose the best matching item based on all available details (name, brand, notes).`
    : '\nThe inventory is currently empty. Create new items for everything you identify.';

  const systemPrompt = isPublic
    ? `You are an inventory assistant for a community pantry. A visitor is taking items from the pantry and has submitted a photo of what they are taking. Use a NEGATIVE quantity_delta equal to the count of each item visible in the photo (e.g. one can = -1). Never use a positive quantity_delta in this context.${inventoryContext}`
    : `You are an inventory assistant. Analyze this image and identify all inventory items visible. Use a positive quantity_delta when items are being added and a negative quantity_delta when items are being removed. Call the update_inventory tool with every item you identify.${inventoryContext}`;

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

  console.log('[image] Bedrock response:', JSON.stringify(response.output?.message?.content, null, 2));

  const toolUseBlock = response.output?.message?.content?.find(b => b.toolUse);
  if (!toolUseBlock?.toolUse) {
    console.log('[image] No tool call — stopReason:', response.stopReason);
    return { updatedItems: [], createdItems: [], message: 'No items identified' };
  }

  const toolInput = toolUseBlock.toolUse.input as unknown as InventoryToolInput;
  console.log('[image] Tool input:', JSON.stringify(toolInput, null, 2));

  // Build a map by itemId for direct lookup — no string matching needed
  const itemsById = new Map(inventoryItems.map(i => [i.itemId, i]));
  const { updatedItems, createdItems } = await applyInventoryUpdates(orgId, toolInput, isPublic, itemsById);

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

async function applyInventoryUpdates(
  orgId: string,
  toolInput: InventoryToolInput,
  isPublic: boolean,
  itemsById: Map<string, Record<string, unknown>>,
) {
  const updatedItems: Array<{ itemId: string; name: string; quantityDelta: number; newQuantity: number }> = [];
  const createdItems: Array<{ itemId: string; name: string; quantity: number }> = [];
  const now = new Date().toISOString();

  await Promise.all(
    toolInput.items.map(async ({ item_id, name, quantity_delta, unit, category }) => {
      // Public captures are always removals — clamp any positive AI delta to negative
      const delta = isPublic ? -Math.abs(quantity_delta) : quantity_delta;

      const existing = item_id ? itemsById.get(item_id) : undefined;
      console.log(`[image] "${name}" item_id=${item_id} → ${existing ? `matched "${existing.name}"` : 'no match'} (delta: ${delta})`);

      if (existing) {
        const newQuantity = Math.max(0, (existing.quantity as number) + delta);
        await docClient.send(new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { PK: `ORG#${orgId}`, SK: `ITEM#${existing.itemId}` },
          UpdateExpression: 'SET quantity = :q, updatedAt = :u',
          ExpressionAttributeValues: { ':q': newQuantity, ':u': now },
        }));
        updatedItems.push({ itemId: existing.itemId as string, name: existing.name as string, quantityDelta: delta, newQuantity });
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
