async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/proxy${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
  });

  if (res.status === 401) {
    window.location.href = '/login';
    return new Promise(() => {});  // suspend until redirect completes
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? res.statusText);
  }

  return res.json();
}

export const api = {
  inventory: {
    list: (orgId: string) =>
      request<InventoryItem[]>(`/orgs/${orgId}/inventory`),

    listPublic: (orgId: string) =>
      request<InventoryItem[]>(`/public/orgs/${orgId}/inventory`),

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

    getPublic: (orgId: string) =>
      request<Org>(`/public/orgs/${orgId}`),

    listMine: () =>
      request<UserOrg[]>('/orgs'),
  },

  image: {
    process: (orgId: string, imageBase64: string, mimeType: string) =>
      request<ProcessImageResult>(`/orgs/${orgId}/capture`, {
        method: 'POST',
        body: JSON.stringify({ imageBase64, mimeType }),
      }),

    processPublic: (orgId: string, imageBase64: string, mimeType: string) =>
      request<ProcessImageResult>(`/public/orgs/${orgId}/capture`, {
        method: 'POST',
        body: JSON.stringify({ imageBase64, mimeType }),
      }),
  },
};

export interface InventoryItem {
  itemId: string; orgId: string; name: string; category: string;
  quantity: number; unit: string; brand?: string; notes?: string;
  aiIdentified: boolean; createdAt: string; updatedAt: string;
}
export interface CreateItemInput { name: string; category: string; quantity: number; unit: string; brand?: string; notes?: string; }
export interface UpdateItemInput { name?: string; category?: string; quantity?: number; unit?: string; brand?: string; notes?: string; }
export interface Member { userId: string; email: string; role: 'owner' | 'member'; addedAt: string; tempPassword?: string; }
export interface Org { orgId: string; orgName: string; createdAt: string; }
export interface UserOrg { orgId: string; orgName: string; role: 'owner' | 'member'; }
export interface ProcessImageResult {
  updatedItems: Array<{ itemId: string; name: string; quantityDelta: number; newQuantity: number }>;
  createdItems: Array<{ itemId: string; name: string; quantity: number }>;
  mock?: boolean;
}
