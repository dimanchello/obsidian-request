import { describe, it, expect } from 'vitest'
import { normalizeRequest, DEFAULT_COLLECTION_DATA, getCollectionNameFromNotePath, getCollectionsDir } from './storage'
import { DEFAULT_AUTO_HEADERS } from './constants'

describe('normalizeRequest', () => {
    it('should normalize a basic request', () => {
        const req = {
            id: '123',
            name: 'Test Request',
            method: 'GET',
            url: 'https://api.example.com'
        }

        const normalized = normalizeRequest(req)
        expect(normalized).toBeDefined()
        if (!normalized) return

        expect(normalized.id).toBe('123')
        expect(normalized.name).toBe('Test Request')
        expect(normalized.method).toBe('GET')
        expect(normalized.url).toBe('https://api.example.com')
        expect(normalized.bodyType).toBe('none')
        expect(normalized.headers).toBeDefined()
    })

    it('should handle divider items', () => {
        const divider = {
            id: '456',
            name: 'API Section',
            itemType: 'divider'
        }

        const normalized = normalizeRequest(divider)
        expect(normalized).toBeDefined()
        if (!normalized) return

        expect(normalized.itemType).toBe('divider')
        expect(normalized.name).toBe('API Section')
    })

    it('should add auto headers', () => {
        const req = {
            id: '789',
            name: 'Request',
            headers: []
        }

        const normalized = normalizeRequest(req)
        expect(normalized).toBeDefined()
        if (!normalized) return

        expect(normalized.headers.length).toBeGreaterThanOrEqual(DEFAULT_AUTO_HEADERS.length)
    })

    it('should not duplicate existing auto headers', () => {
        const req = {
            id: '789',
            name: 'Request',
            headers: [{ key: 'Accept', value: 'application/json', enabled: true, auto: true }]
        }

        const normalized = normalizeRequest(req)
        expect(normalized).toBeDefined()
        if (!normalized) return

        const acceptHeaders = normalized.headers.filter((h) => h.key === 'Accept' && h.auto)
        expect(acceptHeaders.length).toBe(1)
    })

    it('should set default values for missing fields', () => {
        const req = { id: '1' }

        const normalized = normalizeRequest(req)
        expect(normalized).toBeDefined()
        if (!normalized) return

        expect(normalized.bodyRaw).toBe('')
        expect(normalized.bodyFormData).toEqual([])
        expect(normalized.bodyFormUrlEncoded).toEqual([])
        expect(normalized.bodyBinaryPath).toBe('')
        expect(normalized.extractionRules).toEqual([])
        expect(normalized.auth).toEqual({ type: 'none' })
        expect(normalized.settings).toEqual({ followRedirects: true, maxRedirects: 5, verifySsl: true })
        expect(normalized.dependencies).toEqual([])
        expect(normalized.localVariables).toEqual([])
    })

    it('should handle null input', () => {
        expect(normalizeRequest(null)).toBe(null)
        expect(normalizeRequest(undefined)).toBe(undefined)
    })
})

describe('DEFAULT_COLLECTION_DATA', () => {
    it('should have default environment', () => {
        const env = DEFAULT_COLLECTION_DATA.environments[0]
        expect(DEFAULT_COLLECTION_DATA.environments.length).toBe(1)
        expect(env?.id).toBe('default-env')
        expect(env?.name).toBe('Local')
    })

    it('should have empty requests array', () => {
        expect(DEFAULT_COLLECTION_DATA.requests).toEqual([])
    })

    it('should have default active environment', () => {
        expect(DEFAULT_COLLECTION_DATA.activeEnvironmentId).toBe('default-env')
    })
})

function getExpectedName(notePath: string, basename: string): string {
    const normalizedPath = notePath.replace(/\.md$/, '')
    let hash = 0
    for (let i = 0; i < normalizedPath.length; i++) {
        const char = normalizedPath.charCodeAt(i)
        hash = (hash << 5) - hash + char
        hash |= 0
    }
    const hashStr = (hash >>> 0).toString(16)
    return `${basename}_${hashStr}`
}

describe('getCollectionNameFromNotePath', () => {
    it('should extract name from simple note path', () => {
        expect(getCollectionNameFromNotePath('MyNote.md')).toBe(getExpectedName('MyNote.md', 'MyNote'))
    })

    it('should extract name from nested note path', () => {
        expect(getCollectionNameFromNotePath('folder/subfolder/MyNote.md')).toBe(
            getExpectedName('folder/subfolder/MyNote.md', 'MyNote')
        )
    })

    it('should handle path without .md extension', () => {
        expect(getCollectionNameFromNotePath('MyNote')).toBe(getExpectedName('MyNote', 'MyNote'))
    })

    it('should handle path with spaces', () => {
        expect(getCollectionNameFromNotePath('My API Collection.md')).toBe(
            getExpectedName('My API Collection.md', 'My API Collection')
        )
    })

    it('should handle deep nested path', () => {
        expect(getCollectionNameFromNotePath('a/b/c/d/DeepNote.md')).toBe(
            getExpectedName('a/b/c/d/DeepNote.md', 'DeepNote')
        )
    })
})

describe('getCollectionsDir', () => {
    it('should build correct path from plugin dir', () => {
        expect(getCollectionsDir('.obsidian/plugins/obsidian-request')).toBe(
            '.obsidian/plugins/obsidian-request/collections'
        )
    })

    it('should work with custom config dir', () => {
        expect(getCollectionsDir('.custom-config/plugins/my-plugin')).toBe(
            '.custom-config/plugins/my-plugin/collections'
        )
    })
})
