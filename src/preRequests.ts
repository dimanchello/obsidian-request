import { CollectionData, RequestItem, ExtractionRule, PreRequestLog } from './types';
import { executeRequest } from './network';
import { JSONPath } from 'jsonpath-plus';

export async function executeWithDependencies(
    mainReqId: string,
    collectionData: CollectionData,
    onExtract: (envId: string, key: string, value: string) => void,
    onProgress: (status: string) => void,
    executedSet: Set<string> = new Set(),
    logs: PreRequestLog[] = []
): Promise<{ response?: any, error?: string, timeMs: number, logs: PreRequestLog[] }> {

    const request = collectionData.requests.find(r => r.id === mainReqId);
    if (!request) {
        return { error: `Request ${mainReqId} not found`, timeMs: 0, logs };
    }

    if (executedSet.has(request.id)) {
        return { error: `Circular dependency detected: ${request.name}`, timeMs: 0, logs };
    }

    executedSet.add(request.id);

    if (request.dependencies && request.dependencies.length > 0) {
        for (const depId of request.dependencies) {
            const depResult = await executeWithDependencies(depId, collectionData, onExtract, onProgress, new Set(executedSet), logs);
            if (depResult.error) {
                return { error: `Failed dependency [${depId}]: ${depResult.error}`, timeMs: 0, logs };
            }
        }
    }

    try {
        onProgress(`Running: ${request.name}`);
        const res = await executeRequest(request, collectionData);

        const extractedVars: { key: string; value: string }[] = [];

        if (res.response && res.response.json) {
            request.extractionRules.forEach((rule: ExtractionRule) => {
                try {
                    const result = JSONPath({ path: rule.jsonPath, json: res.response.json });
                    if (result && result.length > 0) {
                        const val = typeof result[0] === 'object' ? JSON.stringify(result[0]) : String(result[0]);
                        const targetEnvId = rule.targetEnvironmentId || collectionData.activeEnvironmentId;
                        if (targetEnvId) {
                            onExtract(targetEnvId, rule.name, val);
                            extractedVars.push({ key: rule.name, value: val });

                            const env = collectionData.environments.find(e => e.id === targetEnvId);
                            if (env) {
                                const varIndex = env.variables.findIndex(v => v.key === rule.name);
                                if (varIndex >= 0) {
                                    env.variables[varIndex].value = val;
                                } else {
                                    env.variables.push({ key: rule.name, value: val, enabled: true });
                                }
                            }
                        }
                    }
                } catch (e) {}
            });
        }

        // Only log if it's a dependency (not the main request itself, though logging main is fine too)
        // We log everything, the UI can filter out the main request if needed.
        logs.push({
            requestId: request.id,
            requestName: request.name,
            status: res.response?.status || 0,
            timeMs: res.timeMs,
            extractedVariables: extractedVars,
            error: res.error,
            responseBody: res.response?.text
        });

        return { ...res, logs };
    } catch (e: any) {
        logs.push({
            requestId: request.id,
            requestName: request.name,
            status: 0,
            timeMs: 0,
            extractedVariables: [],
            error: e.message
        });
        return { error: e.message, timeMs: 0, logs };
    }
}
