import * as React from 'react'
import { CollectionData, Environment, RequestItem } from '../../types'
import { HighlightMatch } from './HighlightMatch'

export const FolderNameEditor = ({
    folder,
    onSave,
    onCancel
}: {
    folder: RequestItem
    onSave: (name: string) => void
    onCancel: () => void
}) => {
    const inputRef = React.useRef<HTMLInputElement>(null)
    const [value, setValue] = React.useState(folder.name)

    React.useEffect(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
    }, [])

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            inputRef.current?.blur()
        } else if (e.key === 'Escape') {
            e.preventDefault()
            onCancel()
        }
    }

    const handleBlur = () => {
        onSave(value)
    }

    return (
        <input
            ref={inputRef}
            type="text"
            className="obsidian-request-folder-name-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
        />
    )
}

interface SidebarProps {
    collectionData: CollectionData
    activeReqId: string | null
    sidebarWidth: number
    mobileSidebarOpen: boolean
    searchQuery: string
    dropTargetId: string | null
    dropPosition: 'top' | 'bottom'
    editingFolderId: string | null
    fileInputRef: React.RefObject<HTMLInputElement>
    onSave: (data: CollectionData) => void
    setActiveReqId: (id: string | null) => void
    setMobileSidebarOpen: (open: boolean) => void
    setSearchQuery: (query: string) => void
    setShowEnvManager: (show: boolean) => void
    setShowExportModal: (show: boolean) => void
    setEditingFolderId: (id: string | null) => void
    startSidebarResizing: (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => void
    handleDragStart: (id: string) => void
    handleDragOver: (e: React.DragEvent, id: string) => void
    handleDrop: (e: React.DragEvent, targetId: string) => void
    handleDragEnd: () => void
    handleFolderContextMenu: (e: React.MouseEvent, folderId: string) => void
    addNewRequest: (folderId?: string) => void
    addNewFolder: () => void
    deleteItem: (reqId: string, e: React.MouseEvent) => void
    saveFolderName: (folderId: string, newName: string) => void
    handleImport: () => void
    handleImportFile: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>
}

export const Sidebar: React.FC<SidebarProps> = ({
    collectionData,
    activeReqId,
    sidebarWidth,
    mobileSidebarOpen,
    searchQuery,
    dropTargetId,
    dropPosition,
    editingFolderId,
    fileInputRef,
    onSave,
    setActiveReqId,
    setMobileSidebarOpen,
    setSearchQuery,
    setShowEnvManager,
    setShowExportModal,
    setEditingFolderId,
    startSidebarResizing,
    handleDragStart,
    handleDragOver,
    handleDrop,
    handleDragEnd,
    handleFolderContextMenu,
    addNewRequest,
    addNewFolder,
    deleteItem,
    saveFolderName,
    handleImport,
    handleImportFile
}) => {
    const isSearching = searchQuery.length > 0
    const searchLower = searchQuery.toLowerCase()

    const matchingItemIds = React.useMemo(() => {
        if (!isSearching) return null
        const matches = new Set<string>()
        const requests = collectionData.requests

        for (const req of requests) {
            const nameMatch = (req.name || '').toLowerCase().includes(searchLower)
            if (req.itemType === 'folder') {
                const childrenMatch = requests.some(
                    (r) =>
                        r.folderId === req.id &&
                        ((r.name || '').toLowerCase().includes(searchLower) ||
                            (r.url || '').toLowerCase().includes(searchLower))
                )
                if (nameMatch || childrenMatch) {
                    matches.add(req.id)
                    for (const child of requests.filter((r) => r.folderId === req.id)) {
                        matches.add(child.id)
                    }
                }
            } else {
                const urlMatch = (req.url || '').toLowerCase().includes(searchLower)
                if (nameMatch || urlMatch) {
                    matches.add(req.id)
                    if (req.folderId) matches.add(req.folderId)
                }
            }
        }
        return matches
    }, [collectionData.requests, isSearching, searchLower])

    const renderOrder = React.useMemo(() => {
        const order: { id: string; isFolder?: boolean }[] = []

        if (isSearching) {
            const matched = new Set(matchingItemIds ?? [])
            for (const req of collectionData.requests) {
                if (req.itemType === 'folder' && matched.has(req.id)) {
                    order.push({ id: req.id, isFolder: true })
                } else if (matched.has(req.id)) {
                    order.push({ id: req.id })
                }
            }
        } else {
            for (const req of collectionData.requests) {
                if (req.itemType === 'folder') {
                    order.push({ id: req.id, isFolder: true })
                } else if (!req.folderId) {
                    order.push({ id: req.id })
                }
            }
        }

        return order
    }, [collectionData.requests, matchingItemIds, isSearching])

    const isFolderCollapsed = (folderId: string) => {
        if (isSearching) return false
        return collectionData.uiSettings?.folderState?.[folderId] ?? false
    }

    const toggleFolder = (folderId: string) => {
        const currentState = collectionData.uiSettings?.folderState ?? {}
        const newState = { ...currentState, [folderId]: !currentState[folderId] }
        onSave({ ...collectionData, uiSettings: { ...collectionData.uiSettings, folderState: newState } })
    }

    const renderRequestItem = (req: RequestItem, depth: number) => {
        const isDragOver = dropTargetId === req.id
        const dragClass = isDragOver ? (dropPosition === 'top' ? 'drag-over-top' : 'drag-over') : ''

        return (
            <div
                key={req.id}
                draggable
                onDragStart={() => handleDragStart(req.id)}
                onDragOver={(e) => handleDragOver(e, req.id)}
                onDrop={(e) => handleDrop(e, req.id)}
                onDragEnd={handleDragEnd}
                onClick={() => {
                    setActiveReqId(req.id)
                    if (window.innerWidth <= 768) setMobileSidebarOpen(false)
                }}
                className={`obsidian-request-request-item ${activeReqId === req.id ? 'active' : ''} ${dragClass}`}
                style={{ marginLeft: `${depth * 16}px` }}
            >
                <div style={{ display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
                    <span className={`obsidian-request-method-badge method-${req.method}`}>{req.method}</span>
                    <span
                        style={{ fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                    >
                        <HighlightMatch text={req.name} query={searchQuery} />
                    </span>
                </div>
                <button className="btn-ghost" onClick={(e) => deleteItem(req.id, e)}>
                    ×
                </button>
            </div>
        )
    }

    const renderFolderItem = (folder: RequestItem) => {
        const collapsed = isFolderCollapsed(folder.id)
        const isDragOver = dropTargetId === folder.id
        const dragClass = isDragOver ? (dropPosition === 'top' ? 'drag-over-top' : 'drag-over') : ''
        const isEditing = editingFolderId === folder.id

        return (
            <div key={folder.id} className={`obsidian-request-folder-container ${collapsed ? 'collapsed' : ''}`}>
                <div
                    draggable
                    onDragStart={isEditing ? (e) => e.preventDefault() : () => handleDragStart(folder.id)}
                    onDragOver={(e) => handleDragOver(e, folder.id)}
                    onDrop={(e) => handleDrop(e, folder.id)}
                    onDragEnd={handleDragEnd}
                    onContextMenu={(e) => handleFolderContextMenu(e, folder.id)}
                    className={`obsidian-request-folder-header ${activeReqId === folder.id ? 'active' : ''} ${dragClass}`}
                    onClick={(e) => {
                        e.stopPropagation()
                        toggleFolder(folder.id)
                    }}
                >
                    <span className="obsidian-request-folder-toggle">{collapsed ? '📂' : '📁'}</span>
                    {isEditing ? (
                        <FolderNameEditor
                            folder={folder}
                            onSave={(name) => saveFolderName(folder.id, name)}
                            onCancel={() => setEditingFolderId(null)}
                        />
                    ) : (
                        <span
                            className="obsidian-request-folder-name"
                            onDoubleClick={(e) => {
                                e.stopPropagation()
                                setEditingFolderId(folder.id)
                            }}
                        >
                            <HighlightMatch text={folder.name} query={searchQuery} />
                        </span>
                    )}
                    <button
                        className="btn-ghost obsidian-request-folder-delete"
                        onClick={(e) => {
                            e.stopPropagation()
                            deleteItem(folder.id, e)
                        }}
                    >
                        ×
                    </button>
                </div>
                <div className="obsidian-request-folder-children">
                    {collectionData.requests
                        .filter((r) => r.folderId === folder.id && r.itemType !== 'folder')
                        .map((child) => renderRequestItem(child, 1))}
                </div>
            </div>
        )
    }

    return (
        <>
            <div
                className={`obsidian-request-sidebar ${mobileSidebarOpen ? 'mobile-open' : ''}`}
                style={{ width: window.innerWidth > 768 ? `${sidebarWidth}px` : undefined }}
            >
                <div className="obsidian-request-sidebar-header">
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '8px'
                        }}
                    >
                        <label
                            style={{
                                fontSize: '11px',
                                color: 'var(--text-muted)',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em'
                            }}
                        >
                            Environment
                        </label>
                        <button
                            className="btn-ghost"
                            style={{ padding: '2px 5px', fontSize: '11px' }}
                            onClick={() => setShowEnvManager(true)}
                        >
                            ⚙️
                        </button>
                    </div>
                    <select
                        style={{
                            width: '100%',
                            background: 'var(--background-modifier-form-field)',
                            color: 'var(--text-normal)',
                            border: '1px solid var(--background-modifier-border)',
                            padding: '5px',
                            borderRadius: '4px'
                        }}
                        value={collectionData.activeEnvironmentId ?? ''}
                        onChange={(e) => onSave({ ...collectionData, activeEnvironmentId: e.target.value })}
                    >
                        {collectionData.environments.map((env: Environment) => (
                            <option key={env.id} value={env.id}>
                                {env.name}
                            </option>
                        ))}
                    </select>
                </div>

                <div style={{ padding: '10px', position: 'relative' }}>
                    <input
                        type="text"
                        placeholder="Search requests..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Escape') setSearchQuery('')
                        }}
                        style={{
                            width: '100%',
                            background: 'var(--background-modifier-form-field)',
                            color: 'var(--text-normal)',
                            border: '1px solid var(--background-modifier-border)',
                            padding: '5px',
                            borderRadius: '4px',
                            fontSize: '12px'
                        }}
                    />
                    {searchQuery && (
                        <button
                            className="btn-ghost"
                            style={{
                                position: 'absolute',
                                right: '12px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                padding: '2px 4px',
                                fontSize: '10px'
                            }}
                            onClick={() => setSearchQuery('')}
                        >
                            ✕
                        </button>
                    )}
                </div>

                <div className="obsidian-request-request-list">
                    {renderOrder.map((item) => {
                        const req = collectionData.requests.find((r) => r.id === item.id)
                        if (!req) return null
                        if (item.isFolder) {
                            return renderFolderItem(req)
                        }
                        return renderRequestItem(req, 0)
                    })}

                    <div style={{ display: 'flex', gap: '5px', marginTop: '10px' }}>
                        <button
                            style={{
                                flex: 1,
                                background: 'transparent',
                                border: '1px dashed var(--background-modifier-border)',
                                color: 'var(--text-muted)',
                                padding: '6px',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '12px'
                            }}
                            onClick={() => addNewRequest()}
                        >
                            + Request
                        </button>
                        <button
                            style={{
                                flex: 1,
                                background: 'transparent',
                                border: '1px dashed var(--background-modifier-border)',
                                color: 'var(--text-muted)',
                                padding: '6px',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '12px'
                            }}
                            onClick={addNewFolder}
                        >
                            + Folder
                        </button>
                    </div>
                    <div style={{ display: 'flex', gap: '5px', marginTop: '10px' }}>
                        <button
                            className="btn-ghost"
                            style={{
                                flex: 1,
                                border: '1px solid var(--background-modifier-border) !important',
                                fontSize: '11px'
                            }}
                            onClick={handleImport}
                        >
                            Import
                        </button>
                        <button
                            className="btn-ghost"
                            style={{
                                flex: 1,
                                border: '1px solid var(--background-modifier-border) !important',
                                fontSize: '11px'
                            }}
                            onClick={() => setShowExportModal(true)}
                        >
                            Export
                        </button>
                    </div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".json"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                            void handleImportFile(e)
                        }}
                    />
                </div>
            </div>

            {mobileSidebarOpen && window.innerWidth <= 768 && (
                <div className="obsidian-request-sidebar-backdrop" onClick={() => setMobileSidebarOpen(false)} />
            )}

            <div
                className="obsidian-request-sidebar-resizer"
                onMouseDown={startSidebarResizing}
                onTouchStart={startSidebarResizing}
            ></div>
        </>
    )
}
