import { getAccessToken } from './auth';

const IS_LOCAL = process.env.NODE_ENV === 'development';

/**
 * All API calls go through /api/proxy/* (the Next.js reverse proxy route).
 * In local dev this hits serverless-offline; in production it hits API Gateway.
 */
async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getAccessToken();

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${IS_LOCAL ? 'local-user-001' : token}` } : {}),
    ...(options.headers ?? {}),
  };

  const res = await fetch(`/api/proxy${path}`, { ...options, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? res.statusText);
  }

  return res.json();
}

// ── Inventory ─────────────────────────────────────────────────────────────────

export const api = {
  inventory: {
    list: (orgId: string) =>
      request<InventoryItem[]>(`/orgs/${orgId}/inventory`),

    create: (orgId: string, body: CreateItemInput) =>
      request<InventoryItem>(`/orgs/${orgId}/inventory`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    update: (orgId: string, itemId: string, body: UpdateItemInput) =>
      request<InventoryItem>(`/orgs/${orgId}/inventory/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),

    delete: (orgId: string, itemId: string) =>
      request<{ deleted: boolean }>(`/orgs/${orgId}/inventory/${itemId}`, {
        method: 'DELETE',
      }),
  },

  members: {
    list: (orgId: string) =>
      request<Member[]>(`/orgs/${orgId}/members`),

    add: (orgId: string, email: string) =>
      request<Member>(`/orgs/${orgId}/members`, {
        method: 'POST',
        body: JSON.stringify({ email }),
      }),

    remove: (orgId: string, userId: string) =>
      request<{ removed: boolean }>(`/orgs/${orgId}/members/${userId}`, {
        method: 'DELETE',
      }),
  },

  orgs: {
    listPublic: () =>
      request<Org[]>('/public/orgs'),
  },

  image: {
    process: (orgId: string, imageBase64: string, mimeType: string) =>
      request<ProcessImageResult>(`/orgs/${orgId}/capture`, {
        method: 'POST',
        body: JSON.stringify({ imageBase64, mimeType }),
      }),

    processPublic: (orgId: string, imageBase64: string, mimeType: string) =>
      fetch(`/api/proxy/public/orgs/${orgId}/capture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, mimeType }),
      }).then(r => r.json()) as Promise<ProcessImageResult>,
  },
};

// ── Types (mirrors functions/shared/types.ts) ─────────────────────────────────

export interface InventoryItem {
  itemId: string;
  orgId: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  notes?: string;
  aiIdentified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateItemInput {
  name: string;
  category: string;
  quantity: number;
  unit: string;
  notes?: string;
}

export interface UpdateItemInput {
  name?: string;
  category?: string;
  quantity?: number;
  unit?: string;
  notes?: string;
}

export interface Member {
  userId: string;
  email: string;
  role: 'owner' | 'member';
  addedAt: string;
}

export interface Org {
  orgId: string;
  orgName: string;
  createdAt: string;
}

export interface ProcessImageResult {
  updatedItems: Array<{ itemId: string; name: string; quantityDelta: number; newQuantity: number }>;
  createdItems: Array<{ itemId: string; name: string; quantity: number }>;
  mock?: boolean;
}
