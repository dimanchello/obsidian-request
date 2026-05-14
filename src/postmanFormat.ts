import { CollectionData, RequestItem, Variable } from './types';
import { normalizeRequest } from './storage';

// Simplified Postman Collection v2.1.0 Interfaces
interface PostmanItem {
    name: string;
    request?: {
        method: string;
        url: {
            raw: string;
            query?: { key: string; value: string; disabled?: boolean }[];
        };
        header?: { key: string; value: string; disabled?: boolean }[];
        body?: {
            mode: string;
            raw?: string;
            formdata?: { key: string; value: string; type: string; disabled?: boolean }[];
        };
        auth?: {
            type: string;
            basic?: { key: string; value: string; type: string }[];
            bearer?: { key: string; value: string; type: string }[];
            apikey?: { key: string; value: string; type: string }[];
        };
    };
    item?: PostmanItem[]; // For nested folders
}

interface PostmanCollection {
    info: {
        name: string;
        schema: string;
    };
    item: PostmanItem[];
}

function extractRequests(items: PostmanItem[]): RequestItem[] {
    let requests: RequestItem[] = [];

    for (const item of items) {
        if (item.item) {
            // It's a folder. We create a divider for it.
            requests.push(normalizeRequest({
                id: Date.now().toString() + Math.random().toString(36).substring(7),
                name: item.name || 'Folder',
                itemType: 'divider'
            }));
            requests = requests.concat(extractRequests(item.item));
        } else if (item.request) {
            const req = item.request;

            const queryParams: Variable[] = (req.url.query || []).map(q => ({
                key: q.key,
                value: q.value,
                enabled: !q.disabled
            }));

            const headers: Variable[] = (req.header || []).map(h => ({
                key: h.key,
                value: h.value,
                enabled: !h.disabled
            }));

            let bodyType: RequestItem['bodyType'] = 'none';
            let bodyRaw = '';
            let bodyFormData: RequestItem['bodyFormData'] = [];

            if (req.body) {
                if (req.body.mode === 'raw') {
                    bodyType = 'json';
                    bodyRaw = req.body.raw || '';
                } else if (req.body.mode === 'formdata') {
                    bodyType = 'form-data';
                    bodyFormData = (req.body.formdata || []).map(f => ({
                        key: f.key,
                        value: f.value,
                        type: f.type === 'file' ? 'file' : 'text',
                        enabled: !f.disabled
                    }));
                }
            }

            let authConfig = { type: 'none' } as any;
            if (req.auth) {
                if (req.auth.type === 'basic' && req.auth.basic) {
                    authConfig = {
                        type: 'basic',
                        basicUsername: req.auth.basic.find((i: any) => i.key === 'username')?.value || '',
                        basicPassword: req.auth.basic.find((i: any) => i.key === 'password')?.value || ''
                    };
                } else if (req.auth.type === 'bearer' && req.auth.bearer) {
                    authConfig = {
                        type: 'bearer',
                        bearerToken: req.auth.bearer.find((i: any) => i.key === 'token')?.value || ''
                    };
                } else if (req.auth.type === 'apikey' && req.auth.apikey) {
                    authConfig = {
                        type: 'apikey',
                        apiKeyKey: req.auth.apikey.find((i: any) => i.key === 'key')?.value || '',
                        apiKeyValue: req.auth.apikey.find((i: any) => i.key === 'value')?.value || '',
                        apiKeyAddTo: req.auth.apikey.find((i: any) => i.key === 'in')?.value || 'header'
                    };
                }
            }

            requests.push(normalizeRequest({
                id: Date.now().toString() + Math.random().toString(36).substring(7),
                name: item.name || 'Imported Request',
                method: (req.method || 'GET') as any,
                url: req.url.raw || '',
                headers,
                queryParams,
                bodyType,
                bodyRaw,
                bodyFormData,
                auth: authConfig
            }));
        }
    }

    return requests;
}

export function importPostmanCollection(jsonString: string): RequestItem[] {
    try {
        const data = JSON.parse(jsonString) as PostmanCollection;
        if (data && data.item) {
            return extractRequests(data.item).map(normalizeRequest);
        }
        return [];
    } catch (e) {
        console.error("Failed to parse Postman collection", e);
        throw new Error("Invalid Postman Collection JSON format");
    }
}

export function exportPostmanCollection(collectionData: CollectionData, collectionName: string): string {
    const items: PostmanItem[] = [];
    let currentFolder: PostmanItem | null = null;

    for (const req of collectionData.requests) {
        if (req.itemType === 'divider') {
            currentFolder = {
                name: req.name,
                item: []
            };
            items.push(currentFolder);
            continue;
        }

        let body: any = undefined;
        if (req.bodyType === 'json' || req.bodyType === 'raw') {
            body = { mode: 'raw', raw: req.bodyRaw };
        } else if (req.bodyType === 'form-data') {
            body = {
                mode: 'formdata',
                formdata: req.bodyFormData.map(f => ({
                    key: f.key,
                    value: f.value,
                    type: f.type,
                    disabled: !f.enabled
                }))
            };
        }

        let auth: any = undefined;
        if (req.auth.type === 'basic') {
            auth = {
                type: 'basic',
                basic: [
                    { key: 'username', value: req.auth.basicUsername || '', type: 'string' },
                    { key: 'password', value: req.auth.basicPassword || '', type: 'string' }
                ]
            };
        } else if (req.auth.type === 'bearer') {
            auth = {
                type: 'bearer',
                bearer: [
                    { key: 'token', value: req.auth.bearerToken || '', type: 'string' }
                ]
            };
        } else if (req.auth.type === 'apikey') {
            auth = {
                type: 'apikey',
                apikey: [
                    { key: 'key', value: req.auth.apiKeyKey || '', type: 'string' },
                    { key: 'value', value: req.auth.apiKeyValue || '', type: 'string' },
                    { key: 'in', value: req.auth.apiKeyAddTo || 'header', type: 'string' }
                ]
            };
        }

        const postmanReq: PostmanItem = {
            name: req.name,
            request: {
                method: req.method,
                url: {
                    raw: req.url,
                    query: req.queryParams.map(q => ({
                        key: q.key,
                        value: q.value,
                        disabled: !q.enabled
                    }))
                },
                header: req.headers.map(h => ({
                    key: h.key,
                    value: h.value,
                    disabled: !h.enabled
                })),
                body,
                auth
            }
        };

        if (currentFolder && currentFolder.item) {
            currentFolder.item.push(postmanReq);
        } else {
            items.push(postmanReq);
        }
    }

    const postmanData: PostmanCollection = {
        info: {
            name: collectionName || "Obsidian API Collection",
            schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
        },
        item: items
    };

    return JSON.stringify(postmanData, null, 2);
}
