import { CollectionData, RequestItem, ExtractionRule } from './types';
import { executeRequest } from './network';
import { JSONPath } from 'jsonpath-plus';

export async function executeWithDependencies(
    mainReqId: string,
    collectionData: CollectionData,
    onExtract: (envId: string, key: string, value: string) => void,
    executedSet: Set<string> = new Set()
): Promise<{ response?: any, error?: string, timeMs: number }> {

    const request = collectionData.requests.find(r => r.id === mainReqId);
    if (!request) {
        return { error: `Request ${mainReqId} not found`, timeMs: 0 };
    }

    if (executedSet.has(request.id)) {
        return { error: `Circular dependency detected: ${request.name}`, timeMs: 0 };
    }

    executedSet.add(request.id);

    if (request.dependencies && request.dependencies.length > 0) {
        for (const depId of request.dependencies) {
            const depResult = await executeWithDependencies(depId, collectionData, onExtract, new Set(executedSet));
            if (depResult.error) {
                return { error: `Failed dependency [${depId}]: ${depResult.error}`, timeMs: 0 };
            }
        }
    }

    try {
        const res = await executeRequest(request, collectionData);

        if (res.response && res.response.json) {
            request.extractionRules.forEach((rule: ExtractionRule) => {
                try {
                    const result = JSONPath({ path: rule.jsonPath, json: res.response.json });
                    if (result && result.length > 0) {
                        const val = typeof result[0] === 'object' ? JSON.stringify(result[0]) : String(result[0]);
                        const targetEnvId = rule.targetEnvironmentId || collectionData.activeEnvironmentId;
                        if (targetEnvId) {
                            onExtract(targetEnvId, rule.name, val);

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

        return res;
    } catch (e: any) {
        return { error: e.message, timeMs: 0 };
    }
}
