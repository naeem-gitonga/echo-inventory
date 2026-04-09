// ── Organizations ────────────────────────────────────────────────────────────

export interface Org {
  PK: string;           // "ORG#{orgId}"
  SK: 'METADATA';
  orgId: string;
  orgName: string;
  ownerId: string;
  createdAt: string;    // ISO 8601
  entityType: 'ORG';   // used by GSI1 to list all orgs
  // GSI1
  GSI1PK: 'ORG';
  GSI1SK: string;       // createdAt
}

export interface OrgMember {
  PK: string;           // "ORG#{orgId}"
  SK: string;           // "MEMBER#{userId}"
  userId: string;
  email: string;
  role: 'owner' | 'member';
  addedAt: string;
  addedBy: string;      // userId of whoever added this member
}

// Written to allow efficient lookup of "which orgs does this user belong to?"
export interface UserOrgMembership {
  PK: string;           // "USER#{userId}"
  SK: string;           // "ORG#{orgId}"
  orgId: string;
  orgName: string;
  role: 'owner' | 'member';
}

// ── Inventory ─────────────────────────────────────────────────────────────────

export interface InventoryItem {
  PK: string;           // "ORG#{orgId}"
  SK: string;           // "ITEM#{ulid}"
  itemId: string;
  orgId: string;
  name: string;
  category: Category;
  quantity: number;
  unit: Unit;
  notes?: string;
  imageKey?: string;    // S3 key of archived image
  aiIdentified: boolean;
  createdAt: string;
  updatedAt: string;
}

export type Category =
  | 'Food'
  | 'Electronics'
  | 'Tools'
  | 'Office'
  | 'Clothing'
  | 'Household'
  | 'Other';

export type Unit = 'pcs' | 'boxes' | 'kg' | 'liters' | 'rolls' | 'other';

// ── API input/output shapes ───────────────────────────────────────────────────

export interface CreateItemInput {
  name: string;
  category: Category;
  quantity: number;
  unit: Unit;
  notes?: string;
}

export interface UpdateItemInput {
  name?: string;
  category?: Category;
  quantity?: number;
  unit?: Unit;
  notes?: string;
}

export interface AddMemberInput {
  email: string;
}

export interface ProcessImageInput {
  imageBase64: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
}

export interface ProcessImageResult {
  updatedItems: Array<{ itemId: string; name: string; quantityDelta: number; newQuantity: number }>;
  createdItems: Array<{ itemId: string; name: string; quantity: number }>;
}

// ── Bedrock tool call shape ───────────────────────────────────────────────────

export interface InventoryToolInput {
  items: Array<{
    name: string;
    quantity_delta: number;
    unit: Unit;
    category: Category;
  }>;
}
