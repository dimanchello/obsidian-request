import { CollectionData, RequestItem, ExtractionRule, PreRequestLog } from './types';
import { executeRequest } from './network';
import { JSONPath } from 'jsonpath-plus';

export async function executeWithDependencies(
    mainReqId: string,
    collectionData: CollectionData,
    onExtract: (envId: string, key: string, value: string, isLocal: boolean, localReqId?: string) => void,
    onProgress: (status: string) => void,
    contextReqId: string = mainReqId,
    executedSet: Set<string> = new Set(),
    logs: PreRequestLog[] = [],
    localScopeCache?: Record<string, string>
): Promise<{ response?: any, error?: string, timeMs: number, logs: PreRequestLog[] }> {

    const request = collectionData.requests.find(r => r.id === mainReqId);
    if (!request) {
        return { error: `Request ${mainReqId} not found`, timeMs: 0, logs };
    }

    if (executedSet.has(request.id)) {
        return { error: `Circular dependency detected: ${request.name}`, timeMs: 0, logs };
    }

    executedSet.add(request.id);

    // Initialize local scope cache on first entry
    if (!localScopeCache) {
        localScopeCache = {};
        const contextReq = collectionData.requests.find(r => r.id === contextReqId);
        if (contextReq && contextReq.localVariables) {
            contextReq.localVariables.forEach(v => {
                if (v.enabled) localScopeCache![v.key] = v.value;
            });
        }
    }

    if (request.dependencies && request.dependencies.length > 0) {
        for (const depId of request.dependencies) {
            const depResult = await executeWithDependencies(depId, collectionData, onExtract, onProgress, contextReqId, new Set(executedSet), logs, localScopeCache);
            if (depResult.error) {
                return { error: `Failed dependency [${depId}]: ${depResult.error}`, timeMs: 0, logs };
            }
        }
    }

    try {
        onProgress(`Running: ${request.name}`);
        const res = await executeRequest(request, collectionData, localScopeCache);

        const extractedVars: { key: string; value: string }[] = [];

        if (res.response && res.response.json) {
            request.extractionRules.forEach((rule: ExtractionRule) => {
                try {
                    const result = JSONPath({ path: rule.jsonPath, json: res.response.json });
                    if (result && result.length > 0) {
                        const val = typeof result[0] === 'object' ? JSON.stringify(result[0]) : String(result[0]);
                        let targetEnvId = rule.targetEnvironmentId || collectionData.activeEnvironmentId || '';

                        // Check if variable exists in local context, otherwise global. If neither, force local.
                        const contextReq = collectionData.requests.find(r => r.id === contextReqId);
                        const hasLocal = contextReq?.localVariables?.find(v => v.key === rule.name);

                        let isLocal = false;
                        if (hasLocal) {
                            isLocal = true;
                        } else {
                            const env = collectionData.environments.find(e => e.id === targetEnvId);
                            const hasGlobal = env?.variables.find(v => v.key === rule.name);
                            if (!hasGlobal) {
                                isLocal = true; // Force local if neither exists
                            }
                        }

                        if (isLocal) {
                            onExtract('', rule.name, val, true, contextReqId);
                            extractedVars.push({ key: `(local) ${rule.name}`, value: val });
                            if (localScopeCache) {
                                localScopeCache[rule.name] = val;
                            }
                            if (contextReq && contextReq.localVariables) {
                                const varIndex = contextReq.localVariables.findIndex(v => v.key === rule.name);
                                if (varIndex >= 0) {
                                    contextReq.localVariables[varIndex].value = val;
                                } else {
                                    contextReq.localVariables.push({ key: rule.name, value: val, enabled: true });
                                }
                            }
                        } else if (targetEnvId) {
                            onExtract(targetEnvId, rule.name, val, false);
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
