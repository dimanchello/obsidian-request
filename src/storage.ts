import { CollectionData } from './types';

export const DEFAULT_COLLECTION_DATA: CollectionData = {
    environments: [{ id: 'default-env', name: 'Local', variables: [] }],
    requests: [{
        id: 'default-req',
        name: 'New Request',
        method: 'GET',
        url: 'https://jsonplaceholder.typicode.com/todos/1',
        headers: [],
        queryParams: [],
        bodyType: 'none',
        bodyRaw: '',
        bodyFormData: [],
        bodyFormUrlEncoded: [],
        bodyBinaryPath: '',
        extractionRules: [],
        auth: { type: 'none' },
        settings: { followRedirects: true, maxRedirects: 5, verifySsl: true }
    }],
    activeEnvironmentId: 'default-env'
};

export function parseCollectionData(fileContent: string): CollectionData {
    const jsonBlockRegex = /```json\n([\s\S]*?)\n```/;
    const match = fileContent.match(jsonBlockRegex);
    if (match && match[1]) {
        try {
            return JSON.parse(match[1]) as CollectionData;
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
