import { CollectionData, RequestItem } from './types';
import { DEFAULT_AUTO_HEADERS } from './constants';

export const DEFAULT_COLLECTION_DATA: CollectionData = {
    environments: [{ id: 'default-env', name: 'Local', variables: [] }],
    requests: [], // Replaced with normalized requests later
    activeEnvironmentId: 'default-env'
};

export function normalizeRequest(req: any): RequestItem {
    if (!req) return req;

    // Inject auto headers if they don't exist in the list of headers yet
    let headers = req.headers || [];
    const existingAutoKeys = new Set(headers.filter((h: any) => h.auto).map((h: any) => h.key));
    const missingAutoHeaders = DEFAULT_AUTO_HEADERS.filter(h => !existingAutoKeys.has(h.key));
    headers = [...missingAutoHeaders, ...headers];

    return {
        ...req,
        headers,
        bodyType: req.bodyType || 'none',
        bodyRaw: req.bodyRaw || '',
        bodyFormData: req.bodyFormData || [],
        bodyFormUrlEncoded: req.bodyFormUrlEncoded || [],
        bodyBinaryPath: req.bodyBinaryPath || '',
        extractionRules: req.extractionRules || [],
        auth: req.auth || { type: 'none' },
        settings: req.settings || { followRedirects: true, maxRedirects: 5, verifySsl: true },
        dependencies: req.dependencies || [],
        localVariables: req.localVariables || []
    };
}

export function parseCollectionData(fileContent: string): CollectionData {
    const jsonBlockRegex = /```json\n([\s\S]*?)\n```/;
    const match = fileContent.match(jsonBlockRegex);
    if (match && match[1]) {
        try {
            const parsed = JSON.parse(match[1]) as CollectionData;
            if (parsed && Array.isArray(parsed.requests)) {
                parsed.requests = parsed.requests.map(normalizeRequest);
            }
            return parsed;
        } catch (e) {
            console.error("Failed to parse collection data from JSON block", e);
        }
    }
    return DEFAULT_COLLECTION_DATA;
}

export function updateCollectionData(fileContent: string, data: CollectionData): string {
    const jsonString = JSON.stringify(data, null, 2);
    const jsonBlockRegex = /```json\n([\s\S]*?)\n```/;
    if (jsonBlockRegex.test(fileContent)) {
        return fileContent.replace(jsonBlockRegex, `\`\`\`json\n${jsonString}\n\`\`\``);
    } else {
        if (!fileContent.startsWith('---')) {
             return `---\napi-collection: true\n---\n\n\`\`\`json\n${jsonString}\n\`\`\``;
        }
        return `${fileContent}\n\n\`\`\`json\n${jsonString}\n\`\`\``;
    }
}
