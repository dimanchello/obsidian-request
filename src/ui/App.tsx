import * as React from 'react'
import { CollectionData, RequestItem } from '../types'
import { importExternalCollection, exportExternalCollection, generateUniqueId } from '../importExport'
import { Notice } from 'obsidian'
import { Sidebar } from './components/Sidebar'
import { RequestEditor } from './components/RequestEditor'
import { EnvironmentModal } from './components/EnvironmentModal'
import { ExportModal } from './components/ExportModal'
import {
    SIDEBAR_MIN_WIDTH,
    SIDEBAR_MAX_WIDTH,
    CONTEXT_MENU_WIDTH,
    CONTEXT_MENU_HEIGHT
} from '../constants'

interface AppProps {
    data: CollectionData
    onSave: (data: CollectionData) => void
    collectionName: string
}

export const App: React.FC<AppProps> = ({ data, onSave, collectionName }) => {
    const [collectionData, setCollectionData] = React.useState<CollectionData>(data)
    const [activeReqId, setActiveReqId] = React.useState<string | null>(
        data.requests.length > 0 ? (data.requests[0]?.id ?? null) : null
    )
    const [showEnvManager, setShowEnvManager] = React.useState(false)
    const [mobileSidebarOpen, setMobileSidebarOpen] = React.useState(false)
    const [searchQuery, setSearchQuery] = React.useState('')
    const [sidebarWidth, setSidebarWidth] = React.useState(data.uiSettings?.sidebarWidth ?? 250)
    const [draggedItemId, setDraggedItemId] = React.useState<string | null>(null)
    const [dropTargetId, setDropTargetId] = React.useState<string | null>(null)
    const [dropPosition, setDropPosition] = React.useState<'top' | 'bottom'>('bottom')
    const [showExportModal, setShowExportModal] = React.useState(false)
    const [contextMenu, setContextMenu] = React.useState<{ x: number; y: number; folderId: string } | null>(null)
    const [editingFolderId, setEditingFolderId] = React.useState<string | null>(null)
    const fileInputRef = React.useRef<HTMLInputElement>(null)

    React.useEffect(() => {
        setCollectionData(data)
        if (data.uiSettings?.sidebarWidth) {
            setSidebarWidth(data.uiSettings.sidebarWidth)
        }
    }, [data])

    React.useEffect(() => {
        if (!contextMenu) return
        const handler = () => setContextMenu(null)
        document.addEventListener('click', handler)
        return () => document.removeEventListener('click', handler)
    }, [contextMenu])

    const getClientX = (e: MouseEvent | TouchEvent): number => {
        if ('touches' in e && e.touches && e.touches.length > 0) {
            const touch = e.touches[0]
            if (touch) return touch.clientX
        }
        if ('changedTouches' in e && e.changedTouches && e.changedTouches.length > 0) {
            const touch = e.changedTouches[0]
            if (touch) return touch.clientX
        }
        return (e as MouseEvent).clientX
    }

    const startSidebarResizing = React.useCallback(
        (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
            e.preventDefault()
            const touch = 'touches' in e && e.touches && e.touches.length > 0 ? e.touches[0] : null
            const startX = touch ? touch.clientX : (e as React.MouseEvent).clientX
            const startWidth = sidebarWidth

            const doDrag = (dragEvent: MouseEvent | TouchEvent) => {
                const currentX = getClientX(dragEvent)
                setSidebarWidth(
                    Math.min(Math.max(startWidth + (currentX - startX), SIDEBAR_MIN_WIDTH), SIDEBAR_MAX_WIDTH)
                )
            }

            const stopDrag = (dragEvent: MouseEvent | TouchEvent) => {
                document.removeEventListener('mousemove', doDrag)
                document.removeEventListener('mouseup', stopDrag)
                document.removeEventListener('touchmove', doDrag)
                document.removeEventListener('touchend', stopDrag)
                const currentX = getClientX(dragEvent)
                const finalWidth = Math.min(
                    Math.max(startWidth + (currentX - startX), SIDEBAR_MIN_WIDTH),
                    SIDEBAR_MAX_WIDTH
                )
                onSave({ ...collectionData, uiSettings: { ...collectionData.uiSettings, sidebarWidth: finalWidth } })
            }

            document.addEventListener('mousemove', doDrag)
            document.addEventListener('mouseup', stopDrag)
            document.addEventListener('touchmove', doDrag, { passive: false })
            document.addEventListener('touchend', stopDrag)
        },
        [sidebarWidth, collectionData, onSave]
    )

    const handleSave = (newData: CollectionData) => {
        setCollectionData(newData)
        onSave(newData)
    }

    const isDuplicateName = (name: string, folderId: string | undefined, excludeId: string): boolean => {
        return collectionData.requests.some(
            (r) => r.id !== excludeId && r.folderId === folderId && r.name.toLowerCase() === name.toLowerCase()
        )
    }

    const getUniqueName = (baseName: string, folderId: string | undefined, excludeId?: string): string => {
        const siblingNames = collectionData.requests
            .filter((r) => r.id !== excludeId && r.folderId === folderId)
            .map((r) => r.name)
        let name = baseName
        let counter = 2
        while (siblingNames.includes(name)) {
            name = `${baseName} ${counter}`
            counter++
        }
        return name
    }

    const activeReq = collectionData.requests.find((r) => r.id === activeReqId)

    const handleDragStart = (id: string) => {
        setDraggedItemId(id)
    }

    const handleDragOver = (e: React.DragEvent, id: string) => {
        e.preventDefault()
        setDropTargetId(id)
        const rect = (e.target as HTMLElement)
            .closest('.obsidian-request-request-item, .obsidian-request-folder-header')
            ?.getBoundingClientRect()
        if (rect) {
            const midPoint = rect.top + rect.height / 2
            setDropPosition(e.clientY < midPoint ? 'top' : 'bottom')
        }
    }

    const handleDrop = (e: React.DragEvent, targetId: string) => {
        e.preventDefault()
        if (!draggedItemId || draggedItemId === targetId) {
            setDraggedItemId(null)
            setDropTargetId(null)
            return
        }

        const newRequests = [...collectionData.requests]
        const draggedIdx = newRequests.findIndex((r) => r.id === draggedItemId)
        const targetIdx = newRequests.findIndex((r) => r.id === targetId)

        if (draggedIdx === -1 || targetIdx === -1) {
            setDraggedItemId(null)
            setDropTargetId(null)
            return
        }

        const draggedItem = newRequests[draggedIdx]
        const targetItem = collectionData.requests.find((r) => r.id === targetId)

        if (!draggedItem || !targetItem) {
            setDraggedItemId(null)
            setDropTargetId(null)
            return
        }

        const isDescendantFolder = (
            folderId: string,
            targetFolderId: string | undefined,
            requests: RequestItem[]
        ): boolean => {
            if (!targetFolderId) return false
            let currentId: string | undefined = targetFolderId
            while (currentId) {
                if (currentId === folderId) return true
                const parent = requests.find((r) => r.id === currentId)
                currentId = parent?.folderId
            }
            return false
        }

        let newFolderId: string | undefined
        if (draggedItem.itemType === 'folder') {
            if (targetItem.itemType === 'folder') {
                newFolderId = targetItem.id
            } else {
                newFolderId = targetItem.folderId
            }
            if (isDescendantFolder(draggedItem.id, newFolderId, collectionData.requests)) {
                setDraggedItemId(null)
                setDropTargetId(null)
                return
            }
        } else {
            if (targetItem.itemType === 'folder') {
                newFolderId = targetItem.id
            } else {
                newFolderId = targetItem.folderId
            }
        }

        const oldFolderId = draggedItem.folderId
        const newPosition = targetIdx + (dropPosition === 'bottom' ? 1 : 0)
        const oldPosition = draggedIdx

        if (oldFolderId === newFolderId && oldPosition === newPosition) {
            setDraggedItemId(null)
            setDropTargetId(null)
            return
        }

        const updatedItem: RequestItem = {
            ...draggedItem,
            folderId: newFolderId
        }

        newRequests.splice(draggedIdx, 1)
        const insertAt = draggedIdx < newPosition ? newPosition - 1 : newPosition
        newRequests.splice(insertAt, 0, updatedItem)

        handleSave({ ...collectionData, requests: newRequests })
        setDraggedItemId(null)
        setDropTargetId(null)
    }

    const handleDragEnd = () => {
        setDraggedItemId(null)
        setDropTargetId(null)
    }

    const addNewRequest = (folderId?: string) => {
        const newReq: RequestItem = {
            id: generateUniqueId(),
            itemType: 'request',
            name: getUniqueName('New Request', folderId),
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
            dependencies: [],
            folderId: folderId ?? undefined
        }
        handleSave({ ...collectionData, requests: [...collectionData.requests, newReq] })
        setActiveReqId(newReq.id)
        if (window.innerWidth <= 768) setMobileSidebarOpen(false)
    }

    const addNewFolder = () => {
        const newFolder: RequestItem = {
            id: generateUniqueId(),
            itemType: 'folder',
            name: getUniqueName('New Folder', undefined),
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
            dependencies: [],
            localVariables: []
        }
        handleSave({ ...collectionData, requests: [...collectionData.requests, newFolder] })
    }

    const getAllDescendantIds = (folderId: string, requests: RequestItem[]): Set<string> => {
        const ids = new Set<string>([folderId])
        const findChildren = (parentIds: Set<string>) => {
            let added = false
            for (const req of requests) {
                if (req.folderId && parentIds.has(req.folderId) && !ids.has(req.id)) {
                    ids.add(req.id)
                    added = true
                }
            }
            if (added) findChildren(ids)
        }
        findChildren(ids)
        return ids
    }

    const deleteItem = (reqId: string, e: React.MouseEvent) => {
        e.stopPropagation()
        const req = collectionData.requests.find((r) => r.id === reqId)
        if (!req) return

        if (req.itemType === 'folder') {
            const descendantIds = getAllDescendantIds(reqId, collectionData.requests)
            const childCount = descendantIds.size - 1
            if (!confirm(`Delete folder "${req.name}" and all ${childCount} items inside it?`)) return
            const newReqs = collectionData.requests.filter((r) => !descendantIds.has(r.id))
            handleSave({ ...collectionData, requests: newReqs })
            if (activeReqId && descendantIds.has(activeReqId)) {
                setActiveReqId(newReqs.find((r) => r.itemType !== 'folder')?.id ?? null)
            }
        } else {
            if (!confirm(`Are you sure you want to delete "${req.name}"?`)) return
            const newReqs = collectionData.requests.filter((r) => r.id !== reqId)
            handleSave({ ...collectionData, requests: newReqs })
            if (activeReqId === reqId) setActiveReqId(newReqs.find((r) => r.itemType !== 'folder')?.id ?? null)
        }
    }

    const handleFolderContextMenu = (e: React.MouseEvent, folderId: string) => {
        e.preventDefault()
        e.stopPropagation()
        const rootEl = (e.currentTarget as HTMLElement).closest('.obsidian-request-root')
        if (!rootEl) return
        const rootRect = rootEl.getBoundingClientRect()
        const menuWidth = CONTEXT_MENU_WIDTH
        const menuHeight = CONTEXT_MENU_HEIGHT
        let x = e.clientX - rootRect.left
        let y = e.clientY - rootRect.top
        const rootWidth = rootRect.width
        const rootHeight = rootRect.height
        if (x + menuWidth > rootWidth) x = rootWidth - menuWidth
        if (x < 0) x = 0
        if (y + menuHeight > rootHeight) y = rootHeight - menuHeight
        if (y < 0) y = 0
        setContextMenu({ x, y, folderId })
    }

    const handleImport = () => {
        fileInputRef.current?.click()
    }

    const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        const input = e.target
        if (!file) return

        try {
            const content = await file.text()

            try {
                const parsed = JSON.parse(content)
                if (parsed.requests && Array.isArray(parsed.requests) && parsed.environments) {
                    const idMap = new Map<string, string>()
                    parsed.requests.forEach((r: Record<string, unknown>) => {
                        if (r.id && typeof r.id === 'string') {
                            idMap.set(r.id, generateUniqueId())
                        }
                    })
                    const nativeReqs = parsed.requests.map((r: Record<string, unknown>) => {
                        const newId = (r.id && typeof r.id === 'string' ? idMap.get(r.id) : undefined) ?? generateUniqueId()
                        const newFolderId =
                            r.folderId && typeof r.folderId === 'string'
                                ? idMap.get(r.folderId)
                                : (r.folderId as string | undefined)
                        return { ...r, id: newId, folderId: newFolderId }
                    })
                    handleSave({ ...collectionData, requests: [...collectionData.requests, ...nativeReqs] })
                    new Notice(`Successfully imported ${nativeReqs.length} requests in native format!`)
                    return
                }
            } catch {
                /* empty */
            }

            const importedRequests = importExternalCollection(content)
            if (importedRequests.length > 0) {
                handleSave({ ...collectionData, requests: [...collectionData.requests, ...importedRequests] })
                new Notice(`Successfully imported ${importedRequests.length} requests!`)
            } else {
                new Notice('No requests found in the imported file.')
            }
        } catch (err: unknown) {
            new Notice(`Import failed: ${err instanceof Error ? err.message : String(err)}`)
        }

        input.value = '' as unknown as string
    }

    const handleExport = (format: 'external' | 'native') => {
        try {
            let json = ''
            let filename = ''

            if (format === 'external') {
                json = exportExternalCollection(collectionData, collectionName || 'Obsidian Export')
                filename = `obsidian-request_${Date.now()}.json`
            } else {
                json = JSON.stringify(collectionData, null, 2)
                filename = `obsidian-request-native_${Date.now()}.json`
            }

            const blob = new Blob([json], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = filename
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
            new Notice('Collection exported successfully!')
        } catch {
            new Notice('Export failed!')
        }
        setShowExportModal(false)
    }

    const saveFolderName = (folderId: string, newName: string) => {
        const folder = collectionData.requests.find((r) => r.id === folderId)
        if (!folder) return

        const trimmed = newName.trim()
        if (!trimmed) {
            setEditingFolderId(null)
            return
        }

        if (isDuplicateName(trimmed, folder.folderId, folderId)) {
            new Notice('An item with this name already exists at this level')
            setEditingFolderId(null)
            return
        }

        const newRequests = collectionData.requests.map((r) => (r.id === folderId ? { ...r, name: trimmed } : r))
        handleSave({ ...collectionData, requests: newRequests })
        setEditingFolderId(null)
    }

    return (
        <>
            <div className="obsidian-request-root">
                <Sidebar
                    collectionData={collectionData}
                    activeReqId={activeReqId}
                    sidebarWidth={sidebarWidth}
                    mobileSidebarOpen={mobileSidebarOpen}
                    searchQuery={searchQuery}
                    dropTargetId={dropTargetId}
                    dropPosition={dropPosition}
                    editingFolderId={editingFolderId}
                    fileInputRef={fileInputRef}
                    onSave={handleSave}
                    setActiveReqId={setActiveReqId}
                    setMobileSidebarOpen={setMobileSidebarOpen}
                    setSearchQuery={setSearchQuery}
                    setShowEnvManager={setShowEnvManager}
                    setShowExportModal={setShowExportModal}
                    setEditingFolderId={setEditingFolderId}
                    startSidebarResizing={startSidebarResizing}
                    handleDragStart={handleDragStart}
                    handleDragOver={handleDragOver}
                    handleDrop={handleDrop}
                    handleDragEnd={handleDragEnd}
                    handleFolderContextMenu={handleFolderContextMenu}
                    addNewRequest={addNewRequest}
                    addNewFolder={addNewFolder}
                    deleteItem={deleteItem}
                    saveFolderName={saveFolderName}
                    handleImport={handleImport}
                    handleImportFile={handleImportFile}
                />

                <div className="obsidian-request-main">
                    <div className="obsidian-request-mobile-header">
                        <button onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}>
                            {mobileSidebarOpen ? '✕' : '☰'}
                        </button>
                        <span style={{ fontWeight: 'bold' }}>API Collection</span>
                    </div>

                    {activeReq?.itemType === 'folder' ? (
                        <div
                            style={{
                                flex: 1,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'var(--text-muted)'
                            }}
                        >
                            Select a request to edit.
                        </div>
                    ) : activeReq ? (
                        <RequestEditor
                            request={activeReq}
                            collectionData={collectionData}
                            onChange={(updatedReq: RequestItem) => {
                                const newRequests = collectionData.requests.map((r) =>
                                    r.id === updatedReq.id ? updatedReq : r
                                )
                                handleSave({ ...collectionData, requests: newRequests })
                            }}
                            onSave={handleSave}
                        />
                    ) : (
                        <div
                            style={{
                                flex: 1,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'var(--text-muted)'
                            }}
                        >
                            Select or create a request.
                        </div>
                    )}
                </div>

                <EnvironmentModal
                    show={showEnvManager}
                    collectionData={collectionData}
                    onSave={handleSave}
                    onClose={() => setShowEnvManager(false)}
                />

                <ExportModal
                    show={showExportModal}
                    onClose={() => setShowExportModal(false)}
                    onExport={handleExport}
                />
            </div>

            {contextMenu && (
                <div
                    className="obsidian-request-context-menu"
                    style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <button
                        className="obsidian-request-context-menu-item"
                        onClick={() => {
                            addNewRequest(contextMenu.folderId)
                            setContextMenu(null)
                        }}
                    >
                        Create Request in Folder
                    </button>
                    <button
                        className="obsidian-request-context-menu-item"
                        onClick={() => {
                            setEditingFolderId(contextMenu.folderId)
                            setContextMenu(null)
                        }}
                    >
                        Rename Folder
                    </button>
                    <button
                        className="obsidian-request-context-menu-item"
                        onClick={() => {
                            deleteItem(contextMenu.folderId, {
                                stopPropagation: () => {}
                            } as unknown as React.MouseEvent)
                            setContextMenu(null)
                        }}
                    >
                        Delete Folder
                    </button>
                </div>
            )}
        </>
    )
}
