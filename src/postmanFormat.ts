import { CollectionData, RequestItem, Variable } from './types';

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

            requests.push({
                id: Date.now().toString() + Math.random().toString(36).substring(7),
                name: item.name || 'Imported Request',
                method: (req.method || 'GET') as any,
                url: req.url.raw || '',
                headers,
                queryParams,
                bodyType,
                bodyRaw,
                bodyFormData,
                bodyFormUrlEncoded: [],
                bodyBinaryPath: '',
                extractionRules: [], // Postman tests aren't easily converted to simple JSONPath rules
                auth: { type: 'none' },
                settings: { followRedirects: true, maxRedirects: 5, verifySsl: true }
            });
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
    const postmanData: PostmanCollection = {
        info: {
            name: collectionName || "Obsidian API Collection",
            schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
        },
        item: collectionData.requests.map(req => {
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

            return {
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
                    body
                }
            };
        })
    };

    return JSON.stringify(postmanData, null, 2);
}
