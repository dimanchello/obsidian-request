import { requestUrl, RequestUrlParam, RequestUrlResponse } from 'obsidian';
import { CollectionData, RequestItem, Environment } from './types';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import FormData from 'form-data';

export function substituteVariables(text: string, activeEnvironment?: Environment): string {
    if (!text) return text;
    let result = text;
    if (activeEnvironment) {
        for (const variable of activeEnvironment.variables) {
            if (variable.enabled && variable.key) {
                const regex = new RegExp(`{{${variable.key}}}`, 'g');
                result = result.replace(regex, variable.value);
            }
        }
    }
    return result;
}

export async function executeRequest(
    request: RequestItem,
    collectionData: CollectionData
): Promise<{ response?: RequestUrlResponse | any, error?: string, timeMs: number }> {
    const activeEnv = collectionData.environments.find(e => e.id === collectionData.activeEnvironmentId);

    let url = substituteVariables(request.url, activeEnv);

    const activeQueryParams = request.queryParams.filter(p => p.enabled && p.key);
    if (activeQueryParams.length > 0) {
        const urlObj = new URL(url.startsWith('http') ? url : `http://${url}`);
        activeQueryParams.forEach(p => {
            urlObj.searchParams.append(substituteVariables(p.key, activeEnv), substituteVariables(p.value, activeEnv));
        });
        url = urlObj.toString();
    }

    const headers: Record<string, string> = {};
    request.headers.filter(h => h.enabled && h.key).forEach(h => {
        headers[substituteVariables(h.key, activeEnv)] = substituteVariables(h.value, activeEnv);
    });

    let body: string | ArrayBuffer | undefined = undefined;

    // Use Node request if we have file uploads (because Obsidian's requestUrl doesn't easily support multipart files from local file paths)
    const hasFiles = request.method !== 'GET' && request.method !== 'HEAD' && request.bodyType === 'form-data' && request.bodyFormData.some(f => f.enabled && f.type === 'file' && f.value);

    if (hasFiles) {
        return await executeNodeRequest(url, request, headers, activeEnv);
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
        if (request.bodyType === 'json' || request.bodyType === 'raw') {
            body = substituteVariables(request.bodyRaw, activeEnv);
            if (request.bodyType === 'json' && !headers['Content-Type']) {
                headers['Content-Type'] = 'application/json';
            }
        } else if (request.bodyType === 'form-data') {
            const boundary = `----ObsidianPostmanBoundary${Date.now()}`;
            headers['Content-Type'] = `multipart/form-data; boundary=${boundary}`;

            let parts: string[] = [];
            for (const field of request.bodyFormData.filter(f => f.enabled && f.key)) {
                if (field.type === 'text') {
                    parts.push(
                        `--${boundary}\r\n` +
                        `Content-Disposition: form-data; name="${substituteVariables(field.key, activeEnv)}"\r\n\r\n` +
                        `${substituteVariables(field.value, activeEnv)}\r\n`
                    );
                }
            }
            parts.push(`--${boundary}--\r\n`);
            body = parts.join('');
        }
    }

    const reqParams: RequestUrlParam = {
        url,
        method: request.method,
        headers,
        body,
        throw: false
    };

    const startTime = Date.now();
    try {
        const response = await requestUrl(reqParams);
        const timeMs = Date.now() - startTime;
        return { response, timeMs };
    } catch (err: any) {
        const timeMs = Date.now() - startTime;
        return { error: err.message || "Failed to fetch", timeMs };
    }
}

async function executeNodeRequest(url: string, request: RequestItem, headers: Record<string, string>, activeEnv?: Environment) {
    const startTime = Date.now();
    return new Promise<any>((resolve) => {
        try {
            const form = new FormData();

            for (const field of request.bodyFormData.filter(f => f.enabled && f.key)) {
                const fieldName = substituteVariables(field.key, activeEnv);
                if (field.type === 'text') {
                    form.append(fieldName, substituteVariables(field.value, activeEnv));
                } else if (field.type === 'file' && field.value) {
                    const filePath = substituteVariables(field.value, activeEnv);
                    if (fs.existsSync(filePath)) {
                        form.append(fieldName, fs.createReadStream(filePath));
                    } else {
                        throw new Error(`File not found: ${filePath}`);
                    }
                }
            }

            const urlObj = new URL(url);
            const reqOptions = {
                method: request.method,
                headers: { ...headers, ...form.getHeaders() }
            };

            const client = urlObj.protocol === 'https:' ? https : http;

            const req = client.request(url, reqOptions, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    const timeMs = Date.now() - startTime;
                    let json = null;
                    try {
                        json = JSON.parse(data);
                    } catch(e) {}

                    resolve({
                        response: {
                            status: res.statusCode || 200,
                            text: data,
                            json
                        },
                        timeMs
                    });
                });
            });

            req.on('error', (e) => {
                resolve({ error: e.message, timeMs: Date.now() - startTime });
            });

            form.pipe(req);
        } catch(e: any) {
            resolve({ error: e.message, timeMs: Date.now() - startTime });
        }
    });
}
