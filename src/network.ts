import { requestUrl, RequestUrlParam, RequestUrlResponse } from 'obsidian';
import { CollectionData, RequestItem, Environment } from './types';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
const FormData = require('form-data');

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

    // Apply Auth
    if (request.auth.type === 'basic' && request.auth.basicUsername) {
        const user = substituteVariables(request.auth.basicUsername, activeEnv);
        const pass = substituteVariables(request.auth.basicPassword || '', activeEnv);
        headers['Authorization'] = 'Basic ' + Buffer.from(user + ':' + pass).toString('base64');
    } else if (request.auth.type === 'bearer' && request.auth.bearerToken) {
        headers['Authorization'] = 'Bearer ' + substituteVariables(request.auth.bearerToken, activeEnv);
    } else if (request.auth.type === 'apikey' && request.auth.apiKeyKey) {
        const key = substituteVariables(request.auth.apiKeyKey, activeEnv);
        const val = substituteVariables(request.auth.apiKeyValue || '', activeEnv);
        if (request.auth.apiKeyAddTo === 'header') {
            headers[key] = val;
        } else {
            const urlObj = new URL(url);
            urlObj.searchParams.append(key, val);
            url = urlObj.toString();
        }
    }

    let body: string | ArrayBuffer | undefined = undefined;

    // Node HTTPS/HTTP fallback conditions (e.g. reading binary files or form-data with files, or custom SSL config)
    const hasFiles = request.method !== 'GET' && request.method !== 'HEAD' && request.bodyType === 'form-data' && request.bodyFormData.some(f => f.enabled && f.type === 'file' && f.value);
    const hasBinaryBody = request.method !== 'GET' && request.method !== 'HEAD' && request.bodyType === 'binary' && request.bodyBinaryPath;
    const requiresNode = hasFiles || hasBinaryBody || request.settings.verifySsl === false;

    if (requiresNode) {
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
        } else if (request.bodyType === 'x-www-form-urlencoded') {
            headers['Content-Type'] = 'application/x-www-form-urlencoded';
            const params = new URLSearchParams();
            for (const field of request.bodyFormUrlEncoded.filter(f => f.enabled && f.key)) {
                params.append(substituteVariables(field.key, activeEnv), substituteVariables(field.value, activeEnv));
            }
            body = params.toString();
        }
    }

    // Determine content type of response to format XML
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
            let reqBody: any = null;
            let reqHeaders = { ...headers };

            if (request.method !== 'GET' && request.method !== 'HEAD') {
                if (request.bodyType === 'form-data') {
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
                    reqBody = form;
                    reqHeaders = { ...reqHeaders, ...form.getHeaders() };
                } else if (request.bodyType === 'binary') {
                    const filePath = substituteVariables(request.bodyBinaryPath, activeEnv);
                    if (fs.existsSync(filePath)) {
                        reqBody = fs.createReadStream(filePath);
                        const stats = fs.statSync(filePath);
                        reqHeaders['Content-Length'] = stats.size.toString();
                        if (!reqHeaders['Content-Type']) {
                            reqHeaders['Content-Type'] = 'application/octet-stream';
                        }
                    } else {
                        throw new Error(`Binary file not found: ${filePath}`);
                    }
                }
            }

            const urlObj = new URL(url);
            const reqOptions: https.RequestOptions = {
                method: request.method,
                headers: reqHeaders,
                rejectUnauthorized: request.settings.verifySsl !== false
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

            if (reqBody) {
                if (reqBody.pipe) {
                    reqBody.pipe(req);
                } else {
                    req.write(reqBody);
                    req.end();
                }
            } else {
                req.end();
            }
        } catch(e: any) {
            resolve({ error: e.message, timeMs: Date.now() - startTime });
        }
    });
}
