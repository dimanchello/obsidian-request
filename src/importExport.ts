import { CollectionData, RequestItem, Variable } from './types'
import { normalizeRequest } from './storage'

let idCounter = 0
export function generateUniqueId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID()
    }
    return `${Date.now()}_${++idCounter}_${Math.random().toString(36).substring(2, 9)}`
}

interface ExternalItem {
    name: string
    request?: {
        method: string
        url:
            | string
            | {
                  raw?: string
                  query?: { key: string; value: string; disabled?: boolean }[]
              }
        header?: { key: string; value: string; disabled?: boolean }[]
        body?: {
            mode: string
            raw?: string
            formdata?: { key: string; value: string; type: string; disabled?: boolean }[]
            urlencoded?: { key: string; value: string; disabled?: boolean }[]
            file?: { src: string }
        }
        auth?: {
            type: string
            basic?: { key: string; value: string; type: string }[]
            bearer?: { key: string; value: string; type: string }[]
            apikey?: { key: string; value: string; type: string }[]
        }
    }
    item?: ExternalItem[]
}

interface ExternalCollection {
    info: {
        name: string
        schema: string
    }
    item: ExternalItem[]
}

function extractRequests(items: ExternalItem[], parentFolderId?: string): RequestItem[] {
    let requests: RequestItem[] = []

    for (const item of items) {
        if (item.item) {
            const folderId = generateUniqueId()
            requests.push(
                normalizeRequest({
                    id: folderId,
                    name: item.name || 'Folder',
                    itemType: 'folder'
                }) as RequestItem
            )
            requests = requests.concat(extractRequests(item.item, folderId))
        } else if (item.request) {
            const req = item.request

            let rawUrl = ''
            let queryParams: Variable[] = []

            if (typeof req.url === 'string') {
                rawUrl = req.url
            } else if (req.url && typeof req.url === 'object') {
                rawUrl = req.url.raw ?? ''
                queryParams = (req.url.query ?? []).map((q) => ({
                    key: q.key,
                    value: q.value,
                    enabled: !q.disabled
                }))
            }

            const headers: Variable[] = (req.header ?? []).map((h) => ({
                key: h.key,
                value: h.value,
                enabled: !h.disabled
            }))

            let bodyType: RequestItem['bodyType'] = 'none'
            let bodyRaw = ''
            let bodyFormData: RequestItem['bodyFormData'] = []
            let bodyFormUrlEncoded: RequestItem['bodyFormUrlEncoded'] = []
            let bodyBinaryPath = ''

            if (req.body) {
                if (req.body.mode === 'raw') {
                    bodyType = 'json'
                    bodyRaw = req.body.raw ?? ''
                } else if (req.body.mode === 'formdata') {
                    bodyType = 'form-data'
                    bodyFormData = (req.body.formdata ?? []).map((f) => ({
                        key: f.key,
                        value: f.value,
                        type: f.type === 'file' ? 'file' : 'text',
                        enabled: !f.disabled
                    }))
                } else if (req.body.mode === 'urlencoded') {
                    bodyType = 'x-www-form-urlencoded'
                    bodyFormUrlEncoded = (req.body.urlencoded ?? []).map((u) => ({
                        key: u.key ?? '',
                        value: u.value ?? '',
                        enabled: !u.disabled
                    }))
                } else if (req.body.mode === 'file') {
                    bodyType = 'binary'
                    bodyBinaryPath = req.body.file?.src ?? ''
                }
            }

            let authConfig = { type: 'none' } as Record<string, unknown>
            if (req.auth) {
                if (req.auth.type === 'basic' && req.auth.basic) {
                    authConfig = {
                        type: 'basic',
                        basicUsername:
                            (req.auth.basic.find((i: Record<string, unknown>) => i.key === 'username')
                                ?.value as string) || '',
                        basicPassword:
                            (req.auth.basic.find((i: Record<string, unknown>) => i.key === 'password')
                                ?.value as string) || ''
                    }
                } else if (req.auth.type === 'bearer' && req.auth.bearer) {
                    authConfig = {
                        type: 'bearer',
                        bearerToken:
                            (req.auth.bearer.find((i: Record<string, unknown>) => i.key === 'token')
                                ?.value as string) || ''
                    }
                } else if (req.auth.type === 'apikey' && req.auth.apikey) {
                    authConfig = {
                        type: 'apikey',
                        apiKeyKey:
                            (req.auth.apikey.find((i: Record<string, unknown>) => i.key === 'key')?.value as string) ||
                            '',
                        apiKeyValue:
                            (req.auth.apikey.find((i: Record<string, unknown>) => i.key === 'value')
                                ?.value as string) || '',
                        apiKeyAddTo: ((req.auth.apikey.find((i: Record<string, unknown>) => i.key === 'in')
                            ?.value as string) || 'header') as 'header' | 'query'
                    }
                }
            }

            requests.push(
                normalizeRequest({
                    id: generateUniqueId(),
                    name: item.name || 'Imported Request',
                    method: (req.method || 'GET') as RequestItem['method'],
                    url: rawUrl,
                    headers,
                    queryParams,
                    bodyType,
                    bodyRaw,
                    bodyFormData,
                    bodyFormUrlEncoded,
                    bodyBinaryPath,
                    auth: authConfig as unknown as RequestItem['auth'],
                    folderId: parentFolderId
                }) as RequestItem
            )
        }
    }

    return requests
}

export function importExternalCollection(jsonString: string): RequestItem[] {
    try {
        const data = JSON.parse(jsonString) as ExternalCollection
        if (data?.item) {
            return extractRequests(data.item)
                .map(normalizeRequest)
                .filter((r): r is RequestItem => r !== null && r !== undefined)
        }
        return []
    } catch (e) {
        console.error('Failed to parse external collection', e)
        throw new Error('Invalid collection JSON format')
    }
}

function createExternalItem(req: RequestItem): ExternalItem {
    let body:
        | {
              mode: string
              raw?: string
              formdata?: { key: string; value: string; type: string; disabled?: boolean }[]
              urlencoded?: { key: string; value: string; disabled?: boolean }[]
              file?: { src: string }
          }
        | undefined

    if (req.bodyType === 'json' || req.bodyType === 'raw') {
        body = { mode: 'raw', raw: req.bodyRaw }
    } else if (req.bodyType === 'form-data') {
        body = {
            mode: 'formdata',
            formdata: req.bodyFormData.map((f) => ({
                key: f.key,
                value: f.value,
                type: f.type,
                disabled: !f.enabled
            }))
        }
    } else if (req.bodyType === 'x-www-form-urlencoded') {
        body = {
            mode: 'urlencoded',
            urlencoded: req.bodyFormUrlEncoded.map((v) => ({
                key: v.key,
                value: v.value,
                disabled: !v.enabled
            }))
        }
    } else if (req.bodyType === 'binary') {
        body = {
            mode: 'file',
            file: {
                src: req.bodyBinaryPath
            }
        }
    }

    let auth:
        | {
              type: string
              basic?: { key: string; value: string; type: string }[]
              bearer?: { key: string; value: string; type: string }[]
              apikey?: { key: string; value: string; type: string }[]
          }
        | undefined
    if (req.auth.type === 'basic') {
        auth = {
            type: 'basic',
            basic: [
                { key: 'username', value: req.auth.basicUsername ?? '', type: 'string' },
                { key: 'password', value: req.auth.basicPassword ?? '', type: 'string' }
            ]
        }
    } else if (req.auth.type === 'bearer') {
        auth = {
            type: 'bearer',
            bearer: [{ key: 'token', value: req.auth.bearerToken ?? '', type: 'string' }]
        }
    } else if (req.auth.type === 'apikey') {
        auth = {
            type: 'apikey',
            apikey: [
                { key: 'key', value: req.auth.apiKeyKey ?? '', type: 'string' },
                { key: 'value', value: req.auth.apiKeyValue ?? '', type: 'string' },
                { key: 'in', value: req.auth.apiKeyAddTo ?? 'header', type: 'string' }
            ]
        }
    }

    return {
        name: req.name,
        request: {
            method: req.method,
            url: {
                raw: req.url,
                query: req.queryParams.map((q) => ({
                    key: q.key,
                    value: q.value,
                    disabled: !q.enabled
                }))
            },
            header: req.headers.map((h) => ({
                key: h.key,
                value: h.value,
                disabled: !h.enabled
            })),
            body,
            auth
        }
    }
}

export function exportExternalCollection(collectionData: CollectionData, collectionName: string): string {
    const items: ExternalItem[] = []
    const folderChildren = new Map<string, RequestItem[]>()

    for (const req of collectionData.requests) {
        if (req.itemType === 'divider') continue
        if (req.folderId) {
            const children = folderChildren.get(req.folderId) ?? []
            children.push(req)
            folderChildren.set(req.folderId, children)
        }
    }

    for (const req of collectionData.requests) {
        if (req.itemType === 'divider') continue
        if (req.itemType === 'folder') {
            const children = folderChildren.get(req.id) ?? []
            items.push({
                name: req.name,
                item: children.map(createExternalItem)
            })
        } else if (!req.folderId) {
            items.push(createExternalItem(req))
        }
    }

    const exportData: ExternalCollection = {
        info: {
            name: collectionName || 'Obsidian Request Collection',
            schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
        },
        item: items
    }

    return JSON.stringify(exportData, null, 2)
}
