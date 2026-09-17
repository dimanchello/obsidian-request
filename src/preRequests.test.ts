import { describe, it, expect } from 'vitest'
import { buildExecutionOrder } from './preRequests'
import { RequestItem } from './types'

function createMockRequest(
    id: string,
    name: string,
    dependencies: string[] = [],
    itemType: 'request' | 'folder' | 'divider' = 'request'
): RequestItem {
    return {
        id,
        name,
        method: 'GET',
        url: '',
        headers: [],
        queryParams: [],
        bodyType: 'none',
        bodyRaw: '',
        bodyFormData: [],
        bodyFormUrlEncoded: [],
        bodyBinaryPath: '',
        extractionRules: [],
        auth: { type: 'none' },
        settings: { followRedirects: true, maxRedirects: 5, verifySsl: true },
        dependencies,
        localVariables: [],
        itemType
    }
}

describe('buildExecutionOrder', () => {
    it('should build order for simple flat dependencies', () => {
        const requests = [
            createMockRequest('A', 'Req A', ['B', 'C']),
            createMockRequest('B', 'Req B'),
            createMockRequest('C', 'Req C')
        ]

        const result = buildExecutionOrder('A', requests)
        expect(result.error).toBeUndefined()

        // A depends on B and C. Both must run before A.
        // So B and C must precede A.
        expect(result.order.indexOf('B')).toBeLessThan(result.order.indexOf('A'))
        expect(result.order.indexOf('C')).toBeLessThan(result.order.indexOf('A'))
        expect(result.order.length).toBe(3)
    })

    it('should build order for recursive dependencies', () => {
        const requests = [
            createMockRequest('A', 'Req A', ['B']),
            createMockRequest('B', 'Req B', ['C']),
            createMockRequest('C', 'Req C')
        ]

        const result = buildExecutionOrder('A', requests)
        expect(result.error).toBeUndefined()
        expect(result.order).toEqual(['C', 'B', 'A'])
    })

    it('should handle duplicate dependencies without repeating them', () => {
        const requests = [
            createMockRequest('A', 'Req A', ['B', 'C']),
            createMockRequest('B', 'Req B', ['C']),
            createMockRequest('C', 'Req C')
        ]

        const result = buildExecutionOrder('A', requests)
        expect(result.error).toBeUndefined()
        expect(result.order).toEqual(['C', 'B', 'A'])
    })

    it('should detect circular dependencies', () => {
        const requests = [
            createMockRequest('A', 'Req A', ['B']),
            createMockRequest('B', 'Req B', ['C']),
            createMockRequest('C', 'Req C', ['A'])
        ]

        const result = buildExecutionOrder('A', requests)
        expect(result.error).toBe('Circular dependency detected')
        expect(result.order).toEqual([])
    })

    it('should detect circular dependencies not containing the main request', () => {
        const requests = [
            createMockRequest('A', 'Req A', ['B']),
            createMockRequest('B', 'Req B', ['C']),
            createMockRequest('C', 'Req C', ['B'])
        ]

        const result = buildExecutionOrder('A', requests)
        expect(result.error).toBe('Circular dependency detected')
        expect(result.order).toEqual([])
    })

    it('should skip folders and dividers', () => {
        const requests = [
            createMockRequest('A', 'Req A', ['B', 'C']),
            createMockRequest('B', 'Req B', [], 'folder'),
            createMockRequest('C', 'Req C', [], 'divider')
        ]

        const result = buildExecutionOrder('A', requests)
        expect(result.error).toBeUndefined()
        // B and C are skipped because they are folder and divider
        expect(result.order).toEqual(['A'])
    })
})
