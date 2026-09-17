import { describe, it, expect } from 'vitest'
import { importExternalCollection, generateUniqueId } from './importExport'

describe('generateUniqueId', () => {
    it('should generate non-empty unique string IDs', () => {
        const id1 = generateUniqueId()
        const id2 = generateUniqueId()

        expect(id1).toBeTruthy()
        expect(id2).toBeTruthy()
        expect(id1).not.toBe(id2)
    })
})

describe('importExternalCollection', () => {
    it('should handle Postman collection with raw string URL', () => {
        const postmanCollection = JSON.stringify({
            info: {
                name: 'Test Collection',
                schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
            },
            item: [
                {
                    name: 'String URL Request',
                    request: {
                        method: 'POST',
                        url: 'https://api.example.com/v1/users'
                    }
                }
            ]
        })

        const imported = importExternalCollection(postmanCollection)
        expect(imported.length).toBe(1)
        expect(imported[0]?.name).toBe('String URL Request')
        expect(imported[0]?.url).toBe('https://api.example.com/v1/users')
        expect(imported[0]?.method).toBe('POST')
    })
})
