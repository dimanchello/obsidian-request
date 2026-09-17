import { CollectionData, ExtractionRule, PreRequestLog, RequestItem } from './types'
import { executeRequest } from './network'
import { JSONPath } from 'jsonpath-plus'

export function buildExecutionOrder(
    reqId: string,
    requests: RequestItem[],
    visited: Set<string> = new Set(),
    stack: Set<string> = new Set(),
    order: string[] = []
): { order: string[]; error?: string } {
    if (stack.has(reqId)) {
        return { order: [], error: 'Circular dependency detected' }
    }
    if (visited.has(reqId)) {
        return { order }
    }

    const request = requests.find((r) => r.id === reqId)
    if (!request || request.itemType === 'folder' || request.itemType === 'divider') {
        visited.add(reqId)
        return { order }
    }

    stack.add(reqId)
    if (request.dependencies) {
        for (const depId of request.dependencies) {
            const res = buildExecutionOrder(depId, requests, visited, stack, order)
            if (res.error) return res
        }
    }
    stack.delete(reqId)
    visited.add(reqId)
    order.push(reqId)
    return { order }
}

// Internal helper that only executes a single request without traversing its dependencies
async function executeSingleRequest(
    reqId: string,
    collectionData: CollectionData,
    onExtract: (envId: string, key: string, value: string, isLocal: boolean, localReqId?: string) => void,
    onProgress: (status: string) => void,
    contextReqId: string,
    logs: PreRequestLog[],
    localScopeCache: Record<string, string>
) {
    const request = collectionData.requests.find((r) => r.id === reqId)
    if (!request || request.itemType === 'folder' || request.itemType === 'divider') {
        const err = `Request ${reqId} not found or invalid type`
        logs.push({
            requestId: reqId,
            requestName: request?.name ?? 'Unknown',
            status: 0,
            timeMs: 0,
            extractedVariables: [],
            error: err
        })
        return { error: err, timeMs: 0 }
    }

    try {
        onProgress(`Running: ${request.name}`)
        const res = await executeRequest(request, collectionData, localScopeCache)

        const extractedVars: { key: string; value: string }[] = []

        const jsonBody = res.response?.json
        if (jsonBody) {
            request.extractionRules.forEach((rule: ExtractionRule) => {
                try {
                    const result = JSONPath({ path: rule.jsonPath, json: jsonBody as object })
                    if (result && result.length > 0) {
                        const val = typeof result[0] === 'object' ? JSON.stringify(result[0]) : String(result[0])
                        const targetEnvId = rule.targetEnvironmentId ?? collectionData.activeEnvironmentId ?? ''

                        const contextReq = collectionData.requests.find((r) => r.id === contextReqId)
                        const hasLocal = contextReq?.localVariables?.find((v) => v.key === rule.name)

                        let isLocal = false
                        if (hasLocal) {
                            isLocal = true
                        } else {
                            const env = collectionData.environments.find((e) => e.id === targetEnvId)
                            const hasGlobal = env?.variables.find((v) => v.key === rule.name)
                            if (!hasGlobal) {
                                isLocal = true
                            }
                        }

                        if (isLocal) {
                            if (contextReq) {
                                const newVars = [...(contextReq.localVariables ?? [])]
                                const existingVarIndex = newVars.findIndex((v) => v.key === rule.name)
                                const existingVar = newVars[existingVarIndex]
                                if (existingVarIndex >= 0 && existingVar) {
                                    newVars[existingVarIndex] = { ...existingVar, value: val }
                                } else {
                                    newVars.push({ key: rule.name, value: val, enabled: true })
                                }
                                contextReq.localVariables = newVars
                            }
                            onExtract('', rule.name, val, true, contextReqId)
                            extractedVars.push({ key: `(local) ${rule.name}`, value: val })
                            localScopeCache[rule.name] = val
                        } else if (targetEnvId) {
                            const env = collectionData.environments.find((e) => e.id === targetEnvId)
                            if (env) {
                                const newVars = [...env.variables]
                                const existingVarIndex = newVars.findIndex((v) => v.key === rule.name)
                                const existingVar = newVars[existingVarIndex]
                                if (existingVarIndex >= 0 && existingVar) {
                                    newVars[existingVarIndex] = { ...existingVar, value: val }
                                } else {
                                    newVars.push({ key: rule.name, value: val, enabled: true })
                                }
                                env.variables = newVars
                            }
                            onExtract(targetEnvId, rule.name, val, false)
                            extractedVars.push({ key: rule.name, value: val })
                        }
                    }
                } catch {
                    /* empty */
                }
            })
        }

        logs.push({
            requestId: request.id,
            requestName: request.name,
            status: res.response?.status ?? 0,
            timeMs: res.timeMs,
            extractedVariables: extractedVars,
            error: res.error,
            responseBody: res.response?.text
        })

        return res
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        logs.push({
            requestId: request.id,
            requestName: request.name,
            status: 0,
            timeMs: 0,
            extractedVariables: [],
            error: message
        })
        return { error: message, timeMs: 0 }
    }
}

export async function executeWithDependencies(
    mainReqId: string,
    collectionData: CollectionData,
    onExtract: (envId: string, key: string, value: string, isLocal: boolean, localReqId?: string) => void,
    onProgress: (status: string) => void
) {
    const logs: PreRequestLog[] = []
    const mutableCollectionData = JSON.parse(JSON.stringify(collectionData)) as CollectionData
    const request = mutableCollectionData.requests.find((r) => r.id === mainReqId)
    if (!request) {
        return {
            error: `Request ${mainReqId} not found`,
            timeMs: 0,
            logs,
            updatedCollectionData: mutableCollectionData
        }
    }

    const localScopeCache: Record<string, string> = {}

    // Initialize local scope cache
    if (request.localVariables) {
        request.localVariables.forEach((v) => {
            if (v.enabled) localScopeCache[v.key] = v.value
        })
    }

    // Resolve all recursive dependencies
    const depOrderResult = buildExecutionOrder(mainReqId, mutableCollectionData.requests)
    if (depOrderResult.error) {
        return { error: depOrderResult.error, timeMs: 0, logs, updatedCollectionData: mutableCollectionData }
    }
    const dependenciesToRun = depOrderResult.order.filter((id) => id !== mainReqId)

    // Execute dependencies sequentially using the mutable collection data clone
    if (dependenciesToRun.length > 0) {
        for (const depId of dependenciesToRun) {
            const depResult = await executeSingleRequest(
                depId,
                mutableCollectionData,
                onExtract,
                onProgress,
                mainReqId,
                logs,
                localScopeCache
            )
            if (depResult.error) {
                return {
                    error: `Failed dependency [${depId}]: ${depResult.error}`,
                    timeMs: 0,
                    logs,
                    updatedCollectionData: mutableCollectionData
                }
            }
        }
    }

    try {
        onProgress(`Running: ${request.name}`)
        const res = await executeRequest(request, mutableCollectionData, localScopeCache)

        const extractedVars: { key: string; value: string }[] = []

        const jsonBody = res.response?.json
        if (jsonBody) {
            request.extractionRules.forEach((rule: ExtractionRule) => {
                try {
                    const result = JSONPath({ path: rule.jsonPath, json: jsonBody as object })
                    if (result && result.length > 0) {
                        const val = typeof result[0] === 'object' ? JSON.stringify(result[0]) : String(result[0])
                        const targetEnvId = rule.targetEnvironmentId ?? mutableCollectionData.activeEnvironmentId ?? ''

                        const contextReq = mutableCollectionData.requests.find((r) => r.id === mainReqId)
                        const hasLocal = contextReq?.localVariables?.find((v) => v.key === rule.name)

                        let isLocal = false
                        if (hasLocal) {
                            isLocal = true
                        } else {
                            const env = mutableCollectionData.environments.find((e) => e.id === targetEnvId)
                            const hasGlobal = env?.variables.find((v) => v.key === rule.name)
                            if (!hasGlobal) {
                                isLocal = true
                            }
                        }

                        if (isLocal) {
                            if (contextReq) {
                                const newVars = [...(contextReq.localVariables ?? [])]
                                const existingVarIndex = newVars.findIndex((v) => v.key === rule.name)
                                const existingVar = newVars[existingVarIndex]
                                if (existingVarIndex >= 0 && existingVar) {
                                    newVars[existingVarIndex] = { ...existingVar, value: val }
                                } else {
                                    newVars.push({ key: rule.name, value: val, enabled: true })
                                }
                                contextReq.localVariables = newVars
                            }
                            onExtract('', rule.name, val, true, mainReqId)
                            extractedVars.push({ key: `(local) ${rule.name}`, value: val })
                            localScopeCache[rule.name] = val
                        } else if (targetEnvId) {
                            const env = mutableCollectionData.environments.find((e) => e.id === targetEnvId)
                            if (env) {
                                const newVars = [...env.variables]
                                const existingVarIndex = newVars.findIndex((v) => v.key === rule.name)
                                const existingVar = newVars[existingVarIndex]
                                if (existingVarIndex >= 0 && existingVar) {
                                    newVars[existingVarIndex] = { ...existingVar, value: val }
                                } else {
                                    newVars.push({ key: rule.name, value: val, enabled: true })
                                }
                                env.variables = newVars
                            }
                            onExtract(targetEnvId, rule.name, val, false)
                            extractedVars.push({ key: rule.name, value: val })
                        }
                    }
                } catch {
                    /* empty */
                }
            })
        }

        logs.push({
            requestId: request.id,
            requestName: request.name,
            status: res.response?.status ?? 0,
            timeMs: res.timeMs,
            extractedVariables: extractedVars,
            error: res.error,
            responseBody: res.response?.text
        })

        return { ...res, logs, updatedCollectionData: mutableCollectionData }
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        logs.push({
            requestId: request.id,
            requestName: request.name,
            status: 0,
            timeMs: 0,
            extractedVariables: [],
            error: message
        })
        return { error: message, timeMs: 0, logs, updatedCollectionData: mutableCollectionData }
    }
}
