import * as React from 'react'
import { Notice } from 'obsidian'
import { CollectionData, RequestItem, Environment, Variable, AuthConfig, ExtractionRule, PreRequestLog } from '../../types'
import { executeWithDependencies } from '../../preRequests'
import { PreRequestsTab } from '../PreRequestsTab'
import { formatAndHighlightResponseBody, highlightJsonText } from '../formatter'
import {
    RESPONSE_PANEL_MIN_HEIGHT_PCT,
    RESPONSE_PANEL_MAX_HEIGHT_PCT,
    FALLBACK_CLIENT_HEIGHT
} from '../../constants'

const HighlightedInput = ({
    value,
    onChange,
    className,
    style,
    placeholder,
    collectionData,
    request
}: {
    value: string
    onChange: (val: string) => void
    className?: string
    style?: React.CSSProperties
    placeholder?: string
    collectionData: CollectionData
    request?: RequestItem
}) => {
    const [isEditing, setIsEditing] = React.useState(false)
    const inputRef = React.useRef<HTMLInputElement>(null)

    React.useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus()
        }
    }, [isEditing])

    const activeEnv = collectionData.environments.find((e: Environment) => e.id === collectionData.activeEnvironmentId)

    const getVariableValue = (varName: string) => {
        if (request?.localVariables) {
            const local = request.localVariables.find((v: Variable) => v.key === varName && v.enabled)
            if (local) return `(local) ${local.value}`
        }
        if (!activeEnv) return 'No active environment'
        const variable = activeEnv.variables.find((v: Variable) => v.key === varName && v.enabled)
        return variable ? variable.value : 'Unresolved variable'
    }

    const renderHighlightedText = () => {
        if (!value) return <span style={{ color: 'var(--text-faint)' }}>{placeholder}</span>

        const regex = /({{.*?}})/g
        const parts = value.split(regex)

        return parts.map((part: string, i: number) => {
            if (part.startsWith('{{') && part.endsWith('}}')) {
                const varName = part.substring(2, part.length - 2)
                return (
                    <span key={i} className="obsidian-request-var-highlight" title={getVariableValue(varName)}>
                        {part}
                    </span>
                )
            }
            return <span key={i}>{part}</span>
        })
    }

    if (isEditing) {
        return (
            <input
                ref={inputRef}
                className={className}
                style={style}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onBlur={() => setIsEditing(false)}
                placeholder={placeholder}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') setIsEditing(false)
                }}
            />
        )
    }

    return (
        <div
            className={`obsidian-request-highlighted-input-container ${className ?? ''}`}
            style={style}
            onClick={() => setIsEditing(true)}
            tabIndex={0}
            role="button"
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setIsEditing(true)
                }
            }}
        >
            <div className="obsidian-request-highlighted-input-display">{renderHighlightedText()}</div>
        </div>
    )
}

const RawBodyEditor = ({ value, onChange }: { value: string; onChange: (val: string) => void }) => {
    const textareaRef = React.useRef<HTMLTextAreaElement>(null)
    const highlightRef = React.useRef<HTMLPreElement>(null)

    const handleScroll = () => {
        if (textareaRef.current && highlightRef.current) {
            highlightRef.current.scrollTop = textareaRef.current.scrollTop
            highlightRef.current.scrollLeft = textareaRef.current.scrollLeft
        }
    }

    const highlighted = React.useMemo(() => {
        if (!value) return ''
        try {
            return highlightJsonText(value)
        } catch {
            return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        }
    }, [value])

    const sharedStyle: React.CSSProperties = {
        fontFamily: 'var(--font-monospace)',
        fontSize: 'inherit',
        lineHeight: 'inherit',
        padding: '10px',
        border: '1px solid var(--background-modifier-border)',
        borderRadius: '4px',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
        overflow: 'auto'
    }

    return (
        <div style={{ position: 'relative', flex: 1, minHeight: '150px' }}>
            <pre
                ref={highlightRef}
                aria-hidden="true"
                style={{
                    ...sharedStyle,
                    position: 'absolute',
                    inset: 0,
                    margin: 0,
                    background: 'transparent',
                    color: 'var(--text-normal)',
                    pointerEvents: 'none'
                }}
                dangerouslySetInnerHTML={{
                    __html: highlighted
                        ? highlighted
                        : '<span style="color: var(--text-faint)">{\n  "key": "value"\n}</span>'
                }}
            />
            <textarea
                ref={textareaRef}
                style={{
                    ...sharedStyle,
                    position: 'relative',
                    width: '100%',
                    minHeight: '150px',
                    resize: 'vertical',
                    background: 'transparent',
                    color: 'transparent',
                    caretColor: 'var(--text-normal)'
                }}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onScroll={handleScroll}
                placeholder={'{\n  "key": "value"\n}'}
            />
        </div>
    )
}

const ImagePreview = ({ arrayBuffer, contentType }: { arrayBuffer?: ArrayBuffer; contentType?: string }) => {
    const [blobUrl, setBlobUrl] = React.useState<string | null>(null)

    React.useEffect(() => {
        const url = URL.createObjectURL(
            new Blob([arrayBuffer ?? new ArrayBuffer(0)], { type: contentType ?? 'image/png' })
        )
        setBlobUrl(url)
        return () => URL.revokeObjectURL(url)
    }, [arrayBuffer, contentType])

    if (!blobUrl) return null
    return <img src={blobUrl} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
}

interface RequestEditorProps {
    request: RequestItem
    collectionData: CollectionData
    onChange: (req: RequestItem) => void
    onSave: (newData: CollectionData) => void
}

export const RequestEditor: React.FC<RequestEditorProps> = ({
    request,
    collectionData,
    onChange,
    onSave
}) => {
    const [activeTab, setActiveTab] = React.useState('Params')
    const [response, setResponse] = React.useState<{
        response?: {
            status: number | undefined
            text: string
            contentType?: string
            headers: Record<string, string | string[] | undefined>
            isBinary?: boolean
            arrayBuffer?: ArrayBuffer
        }
        error?: string
        timeMs?: number
        logs?: PreRequestLog[]
    } | null>(null)
    const [loading, setLoading] = React.useState(false)
    const [loadingStatus, setLoadingStatus] = React.useState<string>('')
    const [responseMode, setResponseMode] = React.useState<'raw' | 'preview'>('raw')
    const [responseHeight, setResponseHeight] = React.useState(35)
    const [responseSubTab, setResponseSubTab] = React.useState<'Body' | 'Headers' | 'Cookies' | 'Pre-req Logs'>('Body')

    const [localName, setLocalName] = React.useState(request.name)
    const tabsRef = React.useRef<HTMLDivElement>(null)

    React.useEffect(() => {
        setLocalName(request.name)
    }, [request.id, request.name])

    const getClientY = (e: MouseEvent | TouchEvent): number => {
        if ('touches' in e && e.touches && e.touches.length > 0) {
            const touch = e.touches[0]
            if (touch) return touch.clientY
        }
        if ('changedTouches' in e && e.changedTouches && e.changedTouches.length > 0) {
            const touch = e.changedTouches[0]
            if (touch) return touch.clientY
        }
        return (e as MouseEvent).clientY
    }

    const startResizing = React.useCallback(
        (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
            e.preventDefault()
            const touch = 'touches' in e && e.touches && e.touches.length > 0 ? e.touches[0] : null
            const startY = touch ? touch.clientY : (e as React.MouseEvent).clientY
            const startHeight = responseHeight
            const containerHeight =
                (document.querySelector('.obsidian-request-main') as HTMLElement | null)?.clientHeight ??
                FALLBACK_CLIENT_HEIGHT

            const doDrag = (dragEvent: MouseEvent | TouchEvent) => {
                const currentY = getClientY(dragEvent)
                const deltaY = startY - currentY
                const deltaPercent = (deltaY / containerHeight) * 100
                setResponseHeight(
                    Math.min(
                        Math.max(startHeight + deltaPercent, RESPONSE_PANEL_MIN_HEIGHT_PCT),
                        RESPONSE_PANEL_MAX_HEIGHT_PCT
                    )
                )
            }

            const stopDrag = () => {
                document.removeEventListener('mousemove', doDrag)
                document.removeEventListener('mouseup', stopDrag)
                document.removeEventListener('touchmove', doDrag)
                document.removeEventListener('touchend', stopDrag)
            }

            document.addEventListener('mousemove', doDrag)
            document.addEventListener('mouseup', stopDrag)
            document.addEventListener('touchmove', doDrag, { passive: false })
            document.addEventListener('touchend', stopDrag)
        },
        [responseHeight]
    )

    const handleSend = async () => {
        setLoading(true)
        setLoadingStatus('')
        setResponse(null)
        try {
            const res = await executeWithDependencies(
                request.id,
                collectionData,
                () => {},
                (status) => setLoadingStatus(status)
            )
            setResponse(res as typeof response)
            if (res.updatedCollectionData) {
                onSave(res.updatedCollectionData)
            }
        } catch (e: unknown) {
            setResponse({ error: e instanceof Error ? e.message : String(e) })
        }
        setLoading(false)
        setLoadingStatus('')
    }

    const updateVariableList = (
        listKey: 'queryParams' | 'headers' | 'bodyFormUrlEncoded',
        index: number,
        field: string,
        value: string | boolean
    ) => {
        const newList = request[listKey].map((item, idx) => (idx === index ? { ...item, [field]: value } : item))

        const updatedReq = { ...request, [listKey]: newList }

        if (listKey === 'queryParams') {
            try {
                const baseUrl = updatedReq.url.split('?')[0] ?? ''
                const activeParams = newList.filter((p: Variable) => p.enabled && p.key)
                if (activeParams.length > 0) {
                    const qs = activeParams
                        .map((p: Variable) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
                        .join('&')
                    updatedReq.url = `${baseUrl}?${qs}`
                } else {
                    updatedReq.url = baseUrl
                }
            } catch {
                /* empty */
            }
        }

        onChange(updatedReq)
    }

    const handleUrlChange = (newUrl: string) => {
        const updatedReq = { ...request, url: newUrl }
        try {
            const parts = newUrl.split('?')
            if (parts.length > 1) {
                const qs = parts[1] ?? ''
                const pairs = qs.split('&')
                const newParams: Variable[] = pairs
                    .map((pair) => {
                        const eqIdx = pair.indexOf('=')
                        const k = eqIdx !== -1 ? pair.substring(0, eqIdx) : pair
                        const v = eqIdx !== -1 ? pair.substring(eqIdx + 1) : ''
                        return { key: decodeURIComponent(k), value: decodeURIComponent(v), enabled: true }
                    })
                    .filter((p) => p.key)
                updatedReq.queryParams = newParams
            } else {
                updatedReq.queryParams = []
            }
        } catch {
            /* empty */
        }
        onChange(updatedReq)
    }

    const [showHiddenHeaders, setShowHiddenHeaders] = React.useState(false)

    const renderVariableList = (listKey: 'queryParams' | 'headers' | 'bodyFormUrlEncoded') => {
        const items = request[listKey] ?? []
        const normalItems = listKey === 'headers' ? items.filter((i: Variable) => !i.auto) : items
        const autoItems = listKey === 'headers' ? items.filter((i: Variable) => i.auto) : []

        return (
            <div>
                {normalItems.map((item: Variable, _: number) => {
                    const actualIndex = items.findIndex((orig: Variable) => orig === item)
                    return (
                        <div key={actualIndex} className="obsidian-request-kv-row">
                            <input
                                type="checkbox"
                                checked={item.enabled}
                                onChange={(e) => updateVariableList(listKey, actualIndex, 'enabled', e.target.checked)}
                            />
                            <HighlightedInput
                                className="obsidian-request-kv-input"
                                style={{ flex: 1 }}
                                placeholder="Key"
                                value={item.key}
                                onChange={(val: string) => updateVariableList(listKey, actualIndex, 'key', val)}
                                collectionData={collectionData}
                                request={request}
                            />
                            <HighlightedInput
                                className="obsidian-request-kv-input"
                                style={{ flex: 2 }}
                                placeholder="Value"
                                value={item.value}
                                onChange={(val: string) => updateVariableList(listKey, actualIndex, 'value', val)}
                                collectionData={collectionData}
                                request={request}
                            />
                            <button
                                className="btn-ghost"
                                onClick={() => {
                                    const newList = [...request[listKey]]
                                    newList.splice(actualIndex, 1)
                                    onChange({ ...request, [listKey]: newList })
                                }}
                            >
                                ×
                            </button>
                        </div>
                    )
                })}
                <button
                    className="btn-ghost"
                    style={{ marginTop: '10px', border: '1px solid var(--background-modifier-border) !important' }}
                    onClick={() =>
                        onChange({
                            ...request,
                            [listKey]: [...request[listKey], { key: '', value: '', enabled: true }]
                        })
                    }
                >
                    + Add
                </button>

                {listKey === 'headers' && autoItems.length > 0 && (
                    <div
                        style={{
                            marginTop: '20px',
                            borderTop: '1px dashed var(--background-modifier-border)',
                            paddingTop: '10px'
                        }}
                    >
                        <button
                            className="btn-ghost"
                            style={{ fontSize: '11px', padding: 0, color: 'var(--text-muted)' }}
                            onClick={() => setShowHiddenHeaders(!showHiddenHeaders)}
                        >
                            {showHiddenHeaders ? '▼ Hide' : '▶ Show'} auto-generated headers
                        </button>
                        {showHiddenHeaders && (
                            <div style={{ marginTop: '10px', opacity: 0.8 }}>
                                {autoItems.map((item: Variable, _: number) => {
                                    const actualIndex = items.findIndex((orig: Variable) => orig === item)
                                    return (
                                        <div key={actualIndex} className="obsidian-request-kv-row">
                                            <input
                                                type="checkbox"
                                                checked={item.enabled}
                                                onChange={(e) =>
                                                    updateVariableList(
                                                        listKey,
                                                        actualIndex,
                                                        'enabled',
                                                        e.target.checked
                                                    )
                                                }
                                            />
                                            <input
                                                className="obsidian-request-kv-input"
                                                style={{ flex: 1 }}
                                                value={item.key}
                                                onChange={(e) =>
                                                    updateVariableList(listKey, actualIndex, 'key', e.target.value)
                                                }
                                                disabled
                                            />
                                            <HighlightedInput
                                                className="obsidian-request-kv-input"
                                                style={{ flex: 2 }}
                                                placeholder="Value"
                                                value={item.value}
                                                onChange={(val: string) =>
                                                    updateVariableList(listKey, actualIndex, 'value', val)
                                                }
                                                collectionData={collectionData}
                                                request={request}
                                            />
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>
        )
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', minWidth: 0 }}>
            <div className="obsidian-request-editor-header">
                <input
                    className="obsidian-request-request-title-input"
                    value={localName}
                    onChange={(e) => setLocalName(e.target.value)}
                    onBlur={() => {
                        if (localName !== request.name) {
                            const trimmed = localName.trim()
                            if (!trimmed) {
                                setLocalName(request.name)
                                return
                            }
                            const duplicate = collectionData.requests.some(
                                (r) =>
                                    r.id !== request.id &&
                                    r.folderId === request.folderId &&
                                    r.name.toLowerCase() === trimmed.toLowerCase()
                            )
                            if (duplicate) {
                                new Notice('An item with this name already exists at this level')
                                setLocalName(request.name)
                            } else {
                                onChange({ ...request, name: trimmed })
                            }
                        }
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.currentTarget.blur()
                        }
                    }}
                    placeholder="Request Name"
                />

                <div className="obsidian-request-url-bar">
                    <select
                        value={request.method}
                        onChange={(e) => onChange({ ...request, method: e.target.value as RequestItem['method'] })}
                    >
                        <option value="GET">GET</option>
                        <option value="POST">POST</option>
                        <option value="PUT">PUT</option>
                        <option value="PATCH">PATCH</option>
                        <option value="DELETE">DELETE</option>
                        <option value="OPTIONS">OPTIONS</option>
                        <option value="HEAD">HEAD</option>
                    </select>
                    <HighlightedInput
                        value={request.url}
                        onChange={handleUrlChange}
                        placeholder="Enter request URL"
                        collectionData={collectionData}
                        request={request}
                    />
                    <button onClick={() => { void handleSend() }} disabled={loading}>
                        {loading ? <span className="loading-spinner"></span> : 'Send'}
                    </button>
                </div>
            </div>

            <div
                className="obsidian-request-tabs-header"
                ref={tabsRef}
                onWheel={(e) => {
                    if (tabsRef.current) {
                        e.preventDefault()
                        tabsRef.current.scrollLeft += e.deltaY
                    }
                }}
            >
                {['Params', 'Auth', 'Headers', 'Body', 'Variables', 'Pre-req', 'Extract', 'Settings'].map((tab) => {
                    let hasData = false
                    if (tab === 'Params') hasData = (request.queryParams ?? []).some((p: Variable) => p.key || p.value)
                    if (tab === 'Headers') hasData = (request.headers ?? []).some((p: Variable) => p.key || p.value)
                    if (tab === 'Auth') hasData = request.auth?.type !== 'none'
                    if (tab === 'Body') hasData = request.bodyType !== 'none'
                    if (tab === 'Variables') hasData = (request.localVariables ?? []).length > 0
                    if (tab === 'Pre-req') hasData = (request.dependencies ?? []).length > 0
                    if (tab === 'Extract') hasData = (request.extractionRules ?? []).length > 0

                    return (
                        <div
                            key={tab}
                            className={`obsidian-request-tab ${activeTab === tab ? 'active' : ''}`}
                            onClick={() => setActiveTab(tab)}
                            style={{ position: 'relative' }}
                        >
                            {tab}
                            {hasData && (
                                <span
                                    style={{
                                        position: 'absolute',
                                        top: '8px',
                                        right: '-2px',
                                        width: '6px',
                                        height: '6px',
                                        backgroundColor: 'var(--interactive-accent)',
                                        borderRadius: '50%'
                                    }}
                                ></span>
                            )}
                        </div>
                    )
                })}
            </div>

            <div className="obsidian-request-tab-content">
                {activeTab === 'Params' && renderVariableList('queryParams')}
                {activeTab === 'Headers' && renderVariableList('headers')}
                {activeTab === 'Variables' && (
                    <div
                        style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.9em', padding: '20px' }}
                    >
                        Local variables are set via pre-request dependencies or the Extract tab.
                    </div>
                )}
                {activeTab === 'Auth' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <label style={{ fontWeight: 'bold' }}>Auth Type:</label>
                            <select
                                className="obsidian-request-kv-input"
                                value={request.auth?.type ?? 'none'}
                                onChange={(e) =>
                                    onChange({
                                        ...request,
                                        auth: { ...request.auth, type: e.target.value as AuthConfig['type'] }
                                    })
                                }
                            >
                                <option value="none">No Auth</option>
                                <option value="basic">Basic Auth</option>
                                <option value="bearer">Bearer Token</option>
                                <option value="apikey">API Key</option>
                            </select>
                        </div>
                        {request.auth?.type === 'basic' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '400px' }}>
                                <HighlightedInput
                                    className="obsidian-request-kv-input"
                                    placeholder="Username (e.g. {{username}})"
                                    value={request.auth?.basicUsername ?? ''}
                                    onChange={(val: string) =>
                                        onChange({ ...request, auth: { ...request.auth, basicUsername: val } })
                                    }
                                    collectionData={collectionData}
                                    request={request}
                                />
                                <HighlightedInput
                                    className="obsidian-request-kv-input"
                                    placeholder="Password (e.g. {{password}})"
                                    value={request.auth?.basicPassword ?? ''}
                                    onChange={(val: string) =>
                                        onChange({ ...request, auth: { ...request.auth, basicPassword: val } })
                                    }
                                    collectionData={collectionData}
                                    request={request}
                                />
                            </div>
                        )}
                        {request.auth?.type === 'bearer' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '400px' }}>
                                <HighlightedInput
                                    className="obsidian-request-kv-input"
                                    placeholder="Token (e.g. {{bearerToken}})"
                                    value={request.auth?.bearerToken ?? ''}
                                    onChange={(val: string) =>
                                        onChange({ ...request, auth: { ...request.auth, bearerToken: val } })
                                    }
                                    collectionData={collectionData}
                                    request={request}
                                />
                            </div>
                        )}
                        {request.auth?.type === 'apikey' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '400px' }}>
                                <HighlightedInput
                                    className="obsidian-request-kv-input"
                                    placeholder="Key"
                                    value={request.auth?.apiKeyKey ?? ''}
                                    onChange={(val: string) =>
                                        onChange({ ...request, auth: { ...request.auth, apiKeyKey: val } })
                                    }
                                    collectionData={collectionData}
                                    request={request}
                                />
                                <HighlightedInput
                                    className="obsidian-request-kv-input"
                                    placeholder="Value (e.g. {{apiKey}})"
                                    value={request.auth?.apiKeyValue ?? ''}
                                    onChange={(val: string) =>
                                        onChange({ ...request, auth: { ...request.auth, apiKeyValue: val } })
                                    }
                                    collectionData={collectionData}
                                    request={request}
                                />
                                <select
                                    className="obsidian-request-kv-input"
                                    value={request.auth?.apiKeyAddTo ?? 'header'}
                                    onChange={(e) =>
                                        onChange({
                                            ...request,
                                            auth: {
                                                ...request.auth,
                                                apiKeyAddTo: e.target.value as AuthConfig['apiKeyAddTo']
                                            }
                                        })
                                    }
                                >
                                    <option value="header">Add to Header</option>
                                    <option value="query">Add to Query Params</option>
                                </select>
                            </div>
                        )}
                    </div>
                )}
                {activeTab === 'Settings' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <input
                                type="checkbox"
                                checked={request.settings?.followRedirects ?? true}
                                onChange={(e) =>
                                    onChange({
                                        ...request,
                                        settings: { ...request.settings, followRedirects: e.target.checked }
                                    })
                                }
                            />
                            Follow Redirects
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <label>Max Redirects:</label>
                            <input
                                type="number"
                                className="obsidian-request-kv-input"
                                style={{ width: '80px' }}
                                value={request.settings?.maxRedirects ?? 5}
                                onChange={(e) =>
                                    onChange({
                                        ...request,
                                        settings: { ...request.settings, maxRedirects: parseInt(e.target.value) || 5 }
                                    })
                                }
                            />
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <input
                                type="checkbox"
                                checked={request.settings?.verifySsl ?? true}
                                onChange={(e) =>
                                    onChange({
                                        ...request,
                                        settings: { ...request.settings, verifySsl: e.target.checked }
                                    })
                                }
                            />
                            Verify SSL Certificates
                        </label>
                    </div>
                )}
                {activeTab === 'Body' && (
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                        <div
                            style={{
                                marginBottom: '15px',
                                display: 'flex',
                                gap: '15px',
                                fontSize: '0.9em',
                                flexWrap: 'wrap',
                                alignItems: 'center'
                            }}
                        >
                            <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <input
                                    type="radio"
                                    checked={request.bodyType === 'none'}
                                    onChange={() => onChange({ ...request, bodyType: 'none' })}
                                />{' '}
                                none
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <input
                                    type="radio"
                                    checked={request.bodyType === 'json'}
                                    onChange={() => onChange({ ...request, bodyType: 'json' })}
                                />{' '}
                                raw (JSON)
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <input
                                    type="radio"
                                    checked={request.bodyType === 'form-data'}
                                    onChange={() => onChange({ ...request, bodyType: 'form-data' })}
                                />{' '}
                                form-data
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <input
                                    type="radio"
                                    checked={request.bodyType === 'x-www-form-urlencoded'}
                                    onChange={() => onChange({ ...request, bodyType: 'x-www-form-urlencoded' })}
                                />{' '}
                                x-www-form-urlencoded
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <input
                                    type="radio"
                                    checked={request.bodyType === 'binary'}
                                    onChange={() => onChange({ ...request, bodyType: 'binary' })}
                                />{' '}
                                binary
                            </label>
                            {request.bodyType === 'json' && (
                                <button
                                    className="btn-ghost"
                                    style={{
                                        marginLeft: 'auto',
                                        fontSize: '11px',
                                        border: '1px solid var(--background-modifier-border) !important'
                                    }}
                                    onClick={() => {
                                        try {
                                            const parsed = JSON.parse(request.bodyRaw)
                                            onChange({ ...request, bodyRaw: JSON.stringify(parsed, null, 2) })
                                        } catch {
                                            if (request.bodyRaw.trim().startsWith('<')) {
                                                let formatted = ''
                                                let pad = 0
                                                request.bodyRaw.split(/(?=(?:<[^>]+>))/).forEach((node: string) => {
                                                    if (node.match(/^<\w[^>]*[^/]>.*$/)) {
                                                        formatted += `${'  '.repeat(pad)}${node}\n`
                                                        pad += 1
                                                    } else if (node.match(/^<\/\w/)) {
                                                        if (pad !== 0) pad -= 1
                                                        formatted += `${'  '.repeat(pad)}${node}\n`
                                                    } else {
                                                        formatted += `${'  '.repeat(pad)}${node}\n`
                                                    }
                                                })
                                                onChange({ ...request, bodyRaw: formatted.trim() })
                                            } else {
                                                new Notice('Cannot prettify: Invalid JSON or XML')
                                            }
                                        }
                                    }}
                                >
                                    Prettify
                                </button>
                            )}
                        </div>
                        {request.bodyType === 'json' && (
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                <RawBodyEditor
                                    value={request.bodyRaw}
                                    onChange={(val: string) => onChange({ ...request, bodyRaw: val })}
                                />
                            </div>
                        )}
                        {request.bodyType === 'form-data' && (
                            <div>
                                {request.bodyFormData.map(
                                    (
                                        fd: { key: string; value: string; type: 'text' | 'file'; enabled: boolean },
                                        i: number
                                    ) => (
                                        <div key={i} className="obsidian-request-kv-row">
                                            <input
                                                type="checkbox"
                                                checked={fd.enabled}
                                                onChange={(e) => {
                                                    const newFd = request.bodyFormData.map((item, idx) =>
                                                        idx === i ? { ...item, enabled: e.target.checked } : item
                                                    )
                                                    onChange({ ...request, bodyFormData: newFd })
                                                }}
                                            />
                                            <select
                                                className="obsidian-request-kv-input"
                                                value={fd.type}
                                                onChange={(e) => {
                                                    const newFd = request.bodyFormData.map((item, idx) =>
                                                        idx === i ? { ...item, type: e.target.value as 'text' | 'file' } : item
                                                    )
                                                    onChange({ ...request, bodyFormData: newFd })
                                                }}
                                            >
                                                <option value="text">Text</option>
                                                <option value="file">File</option>
                                            </select>
                                            <input
                                                className="obsidian-request-kv-input"
                                                style={{ flex: 1 }}
                                                placeholder="Key"
                                                value={fd.key}
                                                onChange={(e) => {
                                                    const newFd = request.bodyFormData.map((item, idx) =>
                                                        idx === i ? { ...item, key: e.target.value } : item
                                                    )
                                                    onChange({ ...request, bodyFormData: newFd })
                                                }}
                                            />
                                            {fd.type === 'file' ? (
                                                <input
                                                    className="obsidian-request-kv-input"
                                                    style={{ flex: 2, padding: '4px' }}
                                                    type="file"
                                                    onChange={(e) => {
                                                        const file = e.target.files?.[0]
                                                        if (file) {
                                                            const newFd = request.bodyFormData.map((item, idx) =>
                                                                idx === i
                                                                    ? { ...item, value: (file as File & { path: string }).path }
                                                                    : item
                                                            )
                                                            onChange({ ...request, bodyFormData: newFd })
                                                        }
                                                    }}
                                                />
                                            ) : (
                                                <input
                                                    className="obsidian-request-kv-input"
                                                    style={{ flex: 2 }}
                                                    placeholder="Value"
                                                    value={fd.value}
                                                    onChange={(e) => {
                                                        const newFd = request.bodyFormData.map((item, idx) =>
                                                            idx === i ? { ...item, value: e.target.value } : item
                                                        )
                                                        onChange({ ...request, bodyFormData: newFd })
                                                    }}
                                                />
                                            )}
                                            <button
                                                className="btn-ghost"
                                                onClick={() => {
                                                    const newFd = [...request.bodyFormData]
                                                    newFd.splice(i, 1)
                                                    onChange({ ...request, bodyFormData: newFd })
                                                }}
                                            >
                                                ×
                                            </button>
                                        </div>
                                    )
                                )}
                                <button
                                    className="btn-ghost"
                                    style={{
                                        marginTop: '10px',
                                        border: '1px solid var(--background-modifier-border) !important'
                                    }}
                                    onClick={() =>
                                        onChange({
                                            ...request,
                                            bodyFormData: [
                                                ...request.bodyFormData,
                                                { key: '', value: '', type: 'text', enabled: true }
                                            ]
                                        })
                                    }
                                >
                                    + Add Item
                                </button>
                            </div>
                        )}
                        {request.bodyType === 'x-www-form-urlencoded' && renderVariableList('bodyFormUrlEncoded')}
                        {request.bodyType === 'binary' && (
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                    padding: '20px',
                                    border: '1px dashed var(--background-modifier-border)',
                                    borderRadius: '4px'
                                }}
                            >
                                <input
                                    type="file"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0]
                                        if (file) {
                                            onChange({
                                                ...request,
                                                bodyBinaryPath: (file as File & { path: string }).path
                                            })
                                        }
                                    }}
                                />
                                <span style={{ color: 'var(--text-muted)' }}>
                                    {request.bodyBinaryPath || 'No file selected'}
                                </span>
                            </div>
                        )}
                    </div>
                )}
                {activeTab === 'Extract' && (
                    <div>
                        <p style={{ fontSize: '0.9em', color: 'var(--text-muted)', marginBottom: '15px' }}>
                            Extract values from JSON responses using{' '}
                            <a
                                href="https://github.com/JSONPath-Plus/JSONPath"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                JSONPath
                            </a>{' '}
                            to save them into your active environment.
                        </p>
                        {request.extractionRules.map((rule: ExtractionRule, i: number) => (
                            <div key={i} className="obsidian-request-kv-row">
                                <input
                                    className="obsidian-request-kv-input"
                                    style={{ flex: 1 }}
                                    placeholder="Variable Name (e.g., token)"
                                    value={rule.name}
                                    onChange={(e) => {
                                        const newRules = request.extractionRules.map((item, idx) =>
                                            idx === i ? { ...item, name: e.target.value } : item
                                        )
                                        onChange({ ...request, extractionRules: newRules })
                                    }}
                                />
                                <input
                                    className="obsidian-request-kv-input"
                                    style={{ flex: 2 }}
                                    placeholder="JSONPath (e.g., $.data.token)"
                                    value={rule.jsonPath}
                                    onChange={(e) => {
                                        const newRules = request.extractionRules.map((item, idx) =>
                                            idx === i ? { ...item, jsonPath: e.target.value } : item
                                        )
                                        onChange({ ...request, extractionRules: newRules })
                                    }}
                                />
                                <button
                                    className="btn-ghost"
                                    onClick={() => {
                                        const newRules = [...request.extractionRules]
                                        newRules.splice(i, 1)
                                        onChange({ ...request, extractionRules: newRules })
                                    }}
                                >
                                    ×
                                </button>
                            </div>
                        ))}
                        <button
                            className="btn-ghost"
                            style={{
                                marginTop: '10px',
                                border: '1px solid var(--background-modifier-border) !important'
                            }}
                            onClick={() =>
                                onChange({
                                    ...request,
                                    extractionRules: [
                                        ...request.extractionRules,
                                        { id: Date.now().toString(), name: '', jsonPath: '$' }
                                    ]
                                })
                            }
                        >
                            + Add Rule
                        </button>
                    </div>
                )}
                {activeTab === 'Pre-req' && (
                    <PreRequestsTab request={request} collectionData={collectionData} onChange={onChange} />
                )}
            </div>

            <div
                className="obsidian-request-resizer"
                onMouseDown={startResizing}
                onTouchStart={startResizing}
                title="Drag to resize response view"
            ></div>

            <div className="obsidian-request-response-area" style={{ height: `${responseHeight}%` }}>
                <div className="obsidian-request-response-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={{ display: 'flex', gap: '10px', fontWeight: 600 }}>
                            {['Body', 'Headers', 'Cookies', 'Pre-req Logs'].map((subTab) => (
                                <span
                                    key={subTab}
                                    style={{
                                        cursor: 'pointer',
                                        color: responseSubTab === subTab ? 'var(--text-normal)' : 'var(--text-muted)',
                                        borderBottom:
                                            responseSubTab === subTab ? '2px solid var(--interactive-accent)' : 'none'
                                    }}
                                    onClick={() =>
                                        setResponseSubTab(subTab as 'Body' | 'Headers' | 'Cookies' | 'Pre-req Logs')
                                    }
                                >
                                    {subTab}
                                </span>
                            ))}
                        </div>
                        {response?.response && responseSubTab === 'Body' && (
                            <div style={{ display: 'flex', gap: '5px' }}>
                                <button
                                    className={`btn-ghost ${responseMode === 'raw' ? 'active' : ''}`}
                                    style={{
                                        fontSize: '10px',
                                        background:
                                            responseMode === 'raw'
                                                ? 'var(--background-modifier-active-hover)'
                                                : 'transparent'
                                    }}
                                    onClick={() => setResponseMode('raw')}
                                >
                                    Raw
                                </button>
                                <button
                                    className={`btn-ghost ${responseMode === 'preview' ? 'active' : ''}`}
                                    style={{
                                        fontSize: '10px',
                                        background:
                                            responseMode === 'preview'
                                                ? 'var(--background-modifier-active-hover)'
                                                : 'transparent'
                                    }}
                                    onClick={() => setResponseMode('preview')}
                                >
                                    Preview
                                </button>
                            </div>
                        )}
                    </div>
                    {response?.response && (
                        <div className="obsidian-request-response-status">
                            <span>
                                Status:{' '}
                                <span
                                    className={`obsidian-request-badge ${(response.response.status ?? 0) >= 200 && (response.response.status ?? 0) < 300 ? 'success' : 'error'}`}
                                >
                                    {response.response.status ?? 'N/A'}
                                </span>
                            </span>
                            <span style={{ color: 'var(--text-muted)' }}>Time: {response.timeMs} ms</span>
                        </div>
                    )}
                </div>
                <div
                    className="obsidian-request-response-body"
                    style={{ padding: responseMode === 'preview' && responseSubTab === 'Body' ? '0' : '15px 20px' }}
                >
                    {loading && (
                        <div
                            style={{
                                color: 'var(--text-muted)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '15px 20px'
                            }}
                        >
                            <span className="loading-spinner"></span> {loadingStatus || 'Waiting for response...'}
                        </div>
                    )}
                    {!loading && !response && (
                        <div
                            style={{
                                color: 'var(--text-muted)',
                                fontStyle: 'italic',
                                textAlign: 'center',
                                marginTop: '20px'
                            }}
                        >
                            Enter the URL and click Send to get a response
                        </div>
                    )}
                    {!loading && response?.error && (
                        <div style={{ color: 'var(--color-red)', padding: '15px 20px' }}>Error: {response.error}</div>
                    )}
                    {!loading && response && (
                        <>
                            {response.response && responseSubTab === 'Body' && responseMode === 'raw' && (
                                <pre>
                                    {(() => {
                                        if (response.response.isBinary) {
                                            return `<Binary data: ${response.response.contentType}>`
                                        }
                                        const formatted = formatAndHighlightResponseBody(
                                            response.response.text,
                                            response.response.contentType
                                        )
                                        if (formatted.isHtml) {
                                            return <code dangerouslySetInnerHTML={{ __html: formatted.content }} />
                                        }
                                        return formatted.content
                                    })()}
                                </pre>
                            )}
                            {response.response && responseSubTab === 'Body' && responseMode === 'preview' && (
                                <div style={{ width: '100%', height: '100%', background: 'white' }}>
                                    {response.response.contentType?.includes('image') ? (
                                        <ImagePreview
                                            arrayBuffer={response.response.arrayBuffer}
                                            contentType={response.response.contentType}
                                        />
                                    ) : (
                                        <iframe
                                            srcDoc={response.response.text}
                                            style={{
                                                width: '100%',
                                                height: '100%',
                                                border: 'none',
                                                background: 'white'
                                            }}
                                            sandbox="allow-scripts"
                                        />
                                    )}
                                </div>
                            )}

                            {response.response && responseSubTab === 'Headers' && (
                                <div>
                                    {Object.entries(response.response.headers ?? {}).map(
                                        ([key, val]: [string, string | string[] | undefined], i) => (
                                            <div key={i} className="obsidian-request-kv-row">
                                                <input
                                                    className="obsidian-request-kv-input"
                                                    style={{ flex: 1, fontWeight: 'bold' }}
                                                    readOnly
                                                    value={key}
                                                />
                                                <input
                                                    className="obsidian-request-kv-input"
                                                    style={{ flex: 2 }}
                                                    readOnly
                                                    value={Array.isArray(val) ? val.join(', ') : (val ?? '')}
                                                />
                                            </div>
                                        )
                                    )}
                                </div>
                            )}

                            {response.response && responseSubTab === 'Cookies' && (
                                <div>
                                    {(() => {
                                        const cookies: string[] = Array.isArray(response.response.headers['set-cookie'])
                                            ? response.response.headers['set-cookie']
                                            : response.response.headers['set-cookie']
                                                ? [response.response.headers['set-cookie']]
                                                : []

                                        if (cookies.length === 0)
                                            return (
                                                <div style={{ color: 'var(--text-muted)' }}>No cookies returned.</div>
                                            )

                                        return cookies.map((cookieStr: string, i: number) => {
                                            const parts = cookieStr.split(';')
                                            const [nameVal] = parts
                                            const [name, val] = (nameVal ?? '').split('=')
                                            return (
                                                <div
                                                    key={i}
                                                    className="obsidian-request-kv-row"
                                                    style={{ marginBottom: '10px' }}
                                                >
                                                    <input
                                                        className="obsidian-request-kv-input"
                                                        style={{ flex: 1, fontWeight: 'bold' }}
                                                        readOnly
                                                        value={name}
                                                    />
                                                    <input
                                                        className="obsidian-request-kv-input"
                                                        style={{ flex: 2 }}
                                                        readOnly
                                                        value={val ?? ''}
                                                    />
                                                </div>
                                            )
                                        })
                                    })()}
                                </div>
                            )}

                            {responseSubTab === 'Pre-req Logs' && (
                                <div>
                                    {response.logs && response.logs.length > 0 ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            {response.logs.map((log: PreRequestLog, i: number) => (
                                                <details
                                                    key={i}
                                                    style={{
                                                        border: '1px solid var(--background-modifier-border)',
                                                        borderRadius: '4px',
                                                        overflow: 'hidden'
                                                    }}
                                                >
                                                    <summary
                                                        style={{
                                                            background: 'var(--background-secondary)',
                                                            padding: '4px 8px',
                                                            display: 'flex',
                                                            justifyContent: 'space-between',
                                                            alignItems: 'center',
                                                            cursor: 'pointer',
                                                            outline: 'none'
                                                        }}
                                                    >
                                                        <div
                                                            style={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '8px'
                                                            }}
                                                        >
                                                            <span
                                                                className={`obsidian-request-badge ${log.status >= 200 && log.status < 300 ? 'success' : 'error'}`}
                                                                style={{ fontSize: '9px', padding: '1px 4px' }}
                                                            >
                                                                {log.status ?? 'ERR'}
                                                            </span>
                                                            <span style={{ fontWeight: '600', fontSize: '12px' }}>
                                                                {log.requestName}
                                                            </span>
                                                        </div>
                                                        <div
                                                            style={{
                                                                display: 'flex',
                                                                gap: '10px',
                                                                alignItems: 'center',
                                                                fontSize: '11px'
                                                            }}
                                                        >
                                                            <span style={{ color: 'var(--color-orange)' }}>
                                                                {log.extractedVariables.length > 0
                                                                    ? `+${log.extractedVariables.length} vars`
                                                                    : ''}
                                                            </span>
                                                            <span style={{ color: 'var(--text-muted)' }}>
                                                                {log.timeMs}ms
                                                            </span>
                                                        </div>
                                                    </summary>
                                                    <div
                                                        style={{
                                                            padding: '8px',
                                                            fontSize: '11px',
                                                            borderTop: '1px solid var(--background-modifier-border)'
                                                        }}
                                                    >
                                                        {log.error ? (
                                                            <div style={{ color: 'var(--color-red)' }}>{log.error}</div>
                                                        ) : (
                                                            <div
                                                                style={{
                                                                    display: 'flex',
                                                                    flexDirection: 'column',
                                                                    gap: '8px'
                                                                }}
                                                            >
                                                                {log.extractedVariables.length > 0 && (
                                                                    <div>
                                                                        <span
                                                                            style={{
                                                                                color: 'var(--text-muted)',
                                                                                textTransform: 'uppercase',
                                                                                fontSize: '10px'
                                                                            }}
                                                                        >
                                                                            Extracted
                                                                        </span>
                                                                        <div
                                                                            style={{
                                                                                display: 'flex',
                                                                                flexWrap: 'wrap',
                                                                                gap: '8px',
                                                                                marginTop: '4px'
                                                                            }}
                                                                        >
                                                                            {log.extractedVariables.map(
                                                                                (
                                                                                    v: { key: string; value: string },
                                                                                    j: number
                                                                                ) => (
                                                                                    <span
                                                                                        key={j}
                                                                                        style={{
                                                                                            background:
                                                                                                'var(--background-primary-alt)',
                                                                                            padding: '2px 4px',
                                                                                            borderRadius: '3px',
                                                                                            border: '1px solid var(--background-modifier-border-hover)'
                                                                                        }}
                                                                                    >
                                                                                        <span
                                                                                            style={{
                                                                                                color: 'var(--color-orange)',
                                                                                                marginRight: '4px'
                                                                                            }}
                                                                                        >
                                                                                            {v.key}:
                                                                                        </span>
                                                                                        <span
                                                                                            style={{
                                                                                                color: 'var(--text-normal)'
                                                                                            }}
                                                                                        >
                                                                                            {v.value}
                                                                                        </span>
                                                                                    </span>
                                                                                )
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                                <div>
                                                                    <span
                                                                        style={{
                                                                            color: 'var(--text-muted)',
                                                                            textTransform: 'uppercase',
                                                                            fontSize: '10px'
                                                                        }}
                                                                    >
                                                                        Body
                                                                    </span>
                                                                    <pre
                                                                        style={{
                                                                            marginTop: '4px',
                                                                            maxHeight: '120px',
                                                                            overflowY: 'auto',
                                                                            background: 'var(--background-primary-alt)',
                                                                            padding: '6px',
                                                                            borderRadius: '4px'
                                                                        }}
                                                                    >
                                                                        {(() => {
                                                                            const formatted =
                                                                                formatAndHighlightResponseBody(
                                                                                    log.responseBody,
                                                                                    ''
                                                                                )
                                                                            if (formatted.isHtml) {
                                                                                return (
                                                                                    <code
                                                                                        dangerouslySetInnerHTML={{
                                                                                            __html: formatted.content
                                                                                        }}
                                                                                    />
                                                                                )
                                                                            }
                                                                            return formatted.content
                                                                        })()}
                                                                    </pre>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </details>
                                            ))}
                                        </div>
                                    ) : (
                                        <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                            No dependency logs.
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
