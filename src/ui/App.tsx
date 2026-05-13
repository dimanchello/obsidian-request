import * as React from 'react';
import { JSONPath } from 'jsonpath-plus';
import { CollectionData, RequestItem, Environment, ExtractionRule, Variable } from '../types';
import { executeRequest } from '../network';
import { importPostmanCollection, exportPostmanCollection } from '../postmanFormat';
import { Notice } from 'obsidian';
import { PreRequestsTab } from './PreRequestsTab';
import { executeWithDependencies } from '../preRequests';
import { formatAndHighlightResponseBody } from './formatter';

interface AppProps {
    data: CollectionData;
    onSave: (data: CollectionData) => void;
}

export const App: React.FC<AppProps> = ({ data, onSave }) => {
    const [collectionData, setCollectionData] = React.useState<CollectionData>(data);
    const [activeReqId, setActiveReqId] = React.useState<string | null>(
        data.requests.length > 0 ? data.requests[0].id : null
    );
    const [showEnvManager, setShowEnvManager] = React.useState(false);
    const [mobileSidebarOpen, setMobileSidebarOpen] = React.useState(false);
    const [searchQuery, setSearchQuery] = React.useState("");
    const [sidebarWidth, setSidebarWidth] = React.useState(data.uiSettings?.sidebarWidth || 250);

    React.useEffect(() => {
        setCollectionData(data);
        if (data.uiSettings?.sidebarWidth) {
            setSidebarWidth(data.uiSettings.sidebarWidth);
        }
    }, [data]);

    const startSidebarResizing = React.useCallback((e: any) => {
        e.preventDefault();
        const startX = e.clientX;
        const startWidth = sidebarWidth;

        const doDrag = (dragEvent: any) => {
            const deltaX = dragEvent.clientX - startX;
            setSidebarWidth(Math.min(Math.max(startWidth + deltaX, 150), 500));
        };

        const stopDrag = (dragEvent: any) => {
            document.removeEventListener('mousemove', doDrag);
            document.removeEventListener('mouseup', stopDrag);
            // Save the final width to the collection data
            const deltaX = dragEvent.clientX - startX;
            const finalWidth = Math.min(Math.max(startWidth + deltaX, 150), 500);
            onSave({ ...collectionData, uiSettings: { ...collectionData.uiSettings, sidebarWidth: finalWidth } });
        };

        document.addEventListener('mousemove', doDrag);
        document.addEventListener('mouseup', stopDrag);
    }, [sidebarWidth, collectionData, onSave]);

    const handleSave = (newData: CollectionData) => {
        setCollectionData(newData);
        onSave(newData);
    };

    const activeReq = collectionData.requests.find(r => r.id === activeReqId);

    const filteredRequests = collectionData.requests.filter(r =>
        r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.url.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const addNewRequest = () => {
        const newReq: RequestItem = {
            id: Date.now().toString(),
            name: 'New Request',
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
            dependencies: []
        };
        handleSave({ ...collectionData, requests: [...collectionData.requests, newReq] });
        setActiveReqId(newReq.id);
        if (window.innerWidth <= 768) setMobileSidebarOpen(false);
    };

    const handleImport = async () => {
        try {
            const electron = (window as any).require('electron');
            const fs = (window as any).require('fs');
            const result = await electron.remote.dialog.showOpenDialog({
                properties: ['openFile'],
                filters: [{ name: 'JSON', extensions: ['json'] }]
            });

            if (!result.canceled && result.filePaths.length > 0) {
                const content = fs.readFileSync(result.filePaths[0], 'utf8');
                const importedRequests = importPostmanCollection(content);
                if (importedRequests.length > 0) {
                    handleSave({ ...collectionData, requests: [...collectionData.requests, ...importedRequests] });
                    new Notice(`Successfully imported ${importedRequests.length} requests!`);
                } else {
                    new Notice("No requests found in the imported file.");
                }
            }
        } catch (err: any) {
            new Notice(`Import failed: ${err.message}`);
        }
    };

    const handleExport = () => {
        try {
            const json = exportPostmanCollection(collectionData, "Obsidian Export");
            const blob = new Blob([json], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `obsidian_api_collection_${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            new Notice("Collection exported successfully!");
        } catch(e) {
            new Notice("Export failed!");
        }
    };

    return (
        <div className="postman-clone-root">
            <div className={`postman-sidebar ${mobileSidebarOpen ? 'mobile-open' : ''}`} style={{ width: window.innerWidth > 768 ? `${sidebarWidth}px` : undefined }}>
                <div className="postman-sidebar-header">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <label style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Environment</label>
                        <button className="btn-ghost" style={{ padding: '2px 5px', fontSize: '11px' }} onClick={() => setShowEnvManager(true)}>
                            ⚙️
                        </button>
                    </div>
                    <select
                        style={{ width: '100%', background: 'var(--background-modifier-form-field)', color: 'var(--text-normal)', border: '1px solid var(--background-modifier-border)', padding: '5px', borderRadius: '4px' }}
                        value={collectionData.activeEnvironmentId || ''}
                        onChange={(e) => handleSave({ ...collectionData, activeEnvironmentId: e.target.value })}
                    >
                        {collectionData.environments.map((env: Environment) => (
                            <option key={env.id} value={env.id}>{env.name}</option>
                        ))}
                    </select>
                </div>

                <div style={{ padding: '10px', position: 'relative' }}>
                    <input
                        type="text"
                        placeholder="Search requests..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Escape') setSearchQuery(''); }}
                        style={{ width: '100%', background: 'var(--background-modifier-form-field)', color: 'var(--text-normal)', border: '1px solid var(--background-modifier-border)', padding: '5px', borderRadius: '4px', fontSize: '12px' }}
                    />
                    {searchQuery && (
                        <button
                            className="btn-ghost"
                            style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', padding: '2px 4px', fontSize: '10px' }}
                            onClick={() => setSearchQuery('')}
                        >
                            ✕
                        </button>
                    )}
                </div>

                <div className="postman-request-list">
                    {filteredRequests.map((req: RequestItem) => (
                        <div key={req.id}
                             onClick={() => { setActiveReqId(req.id); if (window.innerWidth <= 768) setMobileSidebarOpen(false); }}
                             className={`postman-request-item ${activeReqId === req.id ? 'active' : ''}`}>
                            <div style={{ display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
                                <span className={`postman-method-badge method-${req.method}`}>{req.method}</span>
                                <span style={{ fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{req.name}</span>
                            </div>
                            <button className="btn-ghost" onClick={(e) => {
                                e.stopPropagation();
                                if (confirm(`Are you sure you want to delete "${req.name}"?`)) {
                                    const newReqs = collectionData.requests.filter(r => r.id !== req.id);
                                    handleSave({ ...collectionData, requests: newReqs });
                                    if (activeReqId === req.id) setActiveReqId(newReqs.length > 0 ? newReqs[0].id : null);
                                }
                            }}>×</button>
                        </div>
                    ))}
                    <button style={{ width: '100%', marginTop: '10px', background: 'transparent', border: '1px dashed var(--background-modifier-border)', color: 'var(--text-muted)', padding: '8px', borderRadius: '4px', cursor: 'pointer' }} onClick={addNewRequest}>
                        + Add Request
                    </button>
                    <div style={{ display: 'flex', gap: '5px', marginTop: '10px' }}>
                        <button className="btn-ghost" style={{ flex: 1, border: '1px solid var(--background-modifier-border) !important', fontSize: '11px' }} onClick={handleImport}>Import</button>
                        <button className="btn-ghost" style={{ flex: 1, border: '1px solid var(--background-modifier-border) !important', fontSize: '11px' }} onClick={handleExport}>Export</button>
                    </div>
                </div>
            </div>

            {window.innerWidth > 768 && <div className="postman-sidebar-resizer" onMouseDown={startSidebarResizing}></div>}

            <div className="postman-main">
                <div className="postman-mobile-header">
                    <button onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}>☰</button>
                    <span style={{ fontWeight: 'bold' }}>API Collection</span>
                </div>

                {activeReq ? (
                    <RequestEditor
                        request={activeReq}
                        collectionData={collectionData}
                        onChange={(updatedReq: RequestItem) => {
                            const newRequests = collectionData.requests.map(r => r.id === updatedReq.id ? updatedReq : r);
                            handleSave({ ...collectionData, requests: newRequests });
                        }}
                        onExtract={(envId: string, key: string, value: string, isLocal: boolean, localReqId?: string) => {
                            if (isLocal && localReqId) {
                                const newRequests = collectionData.requests.map(r => {
                                    if (r.id === localReqId) {
                                        const newVars = [...(r.localVariables || [])];
                                        const existingVarIndex = newVars.findIndex(v => v.key === key);
                                        if (existingVarIndex >= 0) {
                                            newVars[existingVarIndex] = { ...newVars[existingVarIndex], value };
                                        } else {
                                            newVars.push({ key, value, enabled: true });
                                        }
                                        return { ...r, localVariables: newVars };
                                    }
                                    return r;
                                });
                                handleSave({ ...collectionData, requests: newRequests });
                            } else {
                                const newEnvs = collectionData.environments.map(e => {
                                    if (e.id === envId) {
                                        const existingVarIndex = e.variables.findIndex(v => v.key === key);
                                        let newVars = [...e.variables];
                                        if (existingVarIndex >= 0) {
                                            newVars[existingVarIndex] = { ...newVars[existingVarIndex], value: value };
                                        } else {
                                            newVars.push({ key, value, enabled: true });
                                        }
                                        return { ...e, variables: newVars };
                                    }
                                    return e;
                                });
                                handleSave({ ...collectionData, environments: newEnvs });
                            }
                        }}
                    />
                ) : (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                        Select or create a request.
                    </div>
                )}
            </div>

            {showEnvManager && (
                <EnvironmentManager collectionData={collectionData} onSave={handleSave} onClose={() => setShowEnvManager(false)} />
            )}
        </div>
    );
};

const EnvironmentManager = ({ collectionData, onSave, onClose }: any) => {
    const [activeEnvId, setActiveEnvId] = React.useState(collectionData.environments[0]?.id);

    const activeEnv = collectionData.environments.find((e: Environment) => e.id === activeEnvId);

    const handleEnvChange = (updatedEnv: Environment) => {
        const newEnvs = collectionData.environments.map((e: Environment) => e.id === updatedEnv.id ? updatedEnv : e);
        onSave({ ...collectionData, environments: newEnvs });
    };

    const addEnv = () => {
        const newEnv: Environment = { id: Date.now().toString(), name: 'New Environment', variables: [] };
        onSave({ ...collectionData, environments: [...collectionData.environments, newEnv] });
        setActiveEnvId(newEnv.id);
    };

    return (
        <div className="postman-modal-overlay" onClick={onClose}>
            <div className="postman-modal" onClick={e => e.stopPropagation()}>
                <div style={{ padding: '15px 20px', borderBottom: '1px solid var(--background-modifier-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--background-secondary)' }}>
                    <h3 style={{ margin: 0 }}>Manage Environments</h3>
                    <button className="btn-ghost" onClick={onClose}>✕</button>
                </div>
                <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                    <div className="env-sidebar" style={{ width: '220px', borderRight: '1px solid var(--background-modifier-border)', display: 'flex', flexDirection: 'column', background: 'var(--background-secondary)' }}>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
                            {collectionData.environments.map((env: Environment) => (
                                <div key={env.id} onClick={() => setActiveEnvId(env.id)} className={`postman-request-item ${activeEnvId === env.id ? 'active' : ''}`} style={{ marginBottom: '2px' }}>
                                    <span style={{ fontSize: '14px' }}>{env.name}</span>
                                    <button className="btn-ghost" onClick={(e) => {
                                        e.stopPropagation();
                                        const newEnvs = collectionData.environments.filter((e2: Environment) => e2.id !== env.id);
                                        onSave({ ...collectionData, environments: newEnvs, activeEnvironmentId: collectionData.activeEnvironmentId === env.id ? null : collectionData.activeEnvironmentId });
                                    }}>×</button>
                                </div>
                            ))}
                        </div>
                        <div style={{ padding: '10px', borderTop: '1px solid var(--background-modifier-border)' }}>
                            <button style={{ width: '100%', background: 'transparent', border: '1px dashed var(--background-modifier-border)', padding: '6px', borderRadius: '4px', color: 'var(--text-muted)', cursor: 'pointer' }} onClick={addEnv}>+ Add Environment</button>
                        </div>
                    </div>
                    <div style={{ flex: 1, padding: '20px', overflowY: 'auto' }}>
                        {activeEnv ? (
                            <div>
                                <div style={{ marginBottom: '20px' }}>
                                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '5px' }}>Environment Name</label>
                                    <input
                                        style={{ fontSize: '16px', fontWeight: 'bold', width: '100%', background: 'var(--background-primary)', border: '1px solid var(--background-modifier-border)', padding: '8px', borderRadius: '4px' }}
                                        value={activeEnv.name}
                                        onChange={(e) => handleEnvChange({ ...activeEnv, name: e.target.value })}
                                    />
                                </div>

                                <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '10px' }}>Variables</label>
                                {activeEnv.variables.map((v: Variable, i: number) => (
                                    <div key={i} className="postman-kv-row">
                                        <input type="checkbox" checked={v.enabled} onChange={(e) => {
                                            const newVars = [...activeEnv.variables]; newVars[i].enabled = e.target.checked; handleEnvChange({ ...activeEnv, variables: newVars });
                                        }}/>
                                        <input className="postman-kv-input" style={{ flex: 1 }} placeholder="Variable key" value={v.key} onChange={(e) => {
                                            const newVars = [...activeEnv.variables]; newVars[i].key = e.target.value; handleEnvChange({ ...activeEnv, variables: newVars });
                                        }}/>
                                        <input className="postman-kv-input" style={{ flex: 2 }} placeholder="Initial value" value={v.value} onChange={(e) => {
                                            const newVars = [...activeEnv.variables]; newVars[i].value = e.target.value; handleEnvChange({ ...activeEnv, variables: newVars });
                                        }}/>
                                        <button className="btn-ghost" onClick={() => {
                                            const newVars = [...activeEnv.variables]; newVars.splice(i, 1); handleEnvChange({ ...activeEnv, variables: newVars });
                                        }}>×</button>
                                    </div>
                                ))}
                                <button className="btn-ghost" style={{ marginTop: '10px', border: '1px solid var(--background-modifier-border) !important' }} onClick={() => handleEnvChange({ ...activeEnv, variables: [...activeEnv.variables, { key: '', value: '', enabled: true }] })}>
                                    + Add Variable
                                </button>
                            </div>
                        ) : (
                            <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '50px' }}>Select an environment to edit</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const HighlightedInput = ({ value, onChange, className, style, placeholder, collectionData }: any) => {
    const [isEditing, setIsEditing] = React.useState(false);
    const inputRef = React.useRef<HTMLInputElement>(null);

    React.useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isEditing]);

    const activeEnv = collectionData.environments.find((e: Environment) => e.id === collectionData.activeEnvironmentId);

    const getVariableValue = (varName: string) => {
        if (!activeEnv) return 'No active environment';
        const variable = activeEnv.variables.find((v: Variable) => v.key === varName && v.enabled);
        return variable ? variable.value : 'Unresolved variable';
    };

    const renderHighlightedText = () => {
        if (!value) return <span style={{ color: 'var(--text-faint)' }}>{placeholder}</span>;

        const regex = /({{.*?}})/g;
        const parts = value.split(regex);

        return parts.map((part: string, i: number) => {
            if (part.startsWith('{{') && part.endsWith('}}')) {
                const varName = part.substring(2, part.length - 2);
                return (
                    <span key={i} className="postman-var-highlight" title={getVariableValue(varName)}>
                        {part}
                    </span>
                );
            }
            return <span key={i}>{part}</span>;
        });
    };

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
                    if (e.key === 'Enter') setIsEditing(false);
                }}
            />
        );
    }

    return (
        <div
            className={`postman-highlighted-input-container ${className || ''}`}
            style={style}
            onClick={() => setIsEditing(true)}
        >
            <div className="postman-highlighted-input-display">
                {renderHighlightedText()}
            </div>
        </div>
    );
};

const RawBodyEditor = ({ value, onChange }: { value: string, onChange: (val: string) => void }) => {
    const [isFocused, setIsFocused] = React.useState(false);
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);

    React.useEffect(() => {
        if (isFocused && textareaRef.current) {
            textareaRef.current.focus();
        }
    }, [isFocused]);

    if (isFocused) {
        return (
            <textarea
                ref={textareaRef}
                style={{ flex: 1, width: '100%', minHeight: '150px', fontFamily: 'var(--font-monospace)', background: 'var(--background-primary)', color: 'var(--text-normal)', border: '1px solid var(--interactive-accent)', padding: '10px', borderRadius: '4px', resize: 'vertical' }}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onBlur={() => setIsFocused(false)}
                placeholder={"{\n  \"key\": \"value\"\n}"}
            />
        );
    }

    return (
        <div
            style={{ flex: 1, width: '100%', minHeight: '150px', fontFamily: 'var(--font-monospace)', background: 'var(--background-primary)', color: 'var(--text-normal)', border: '1px solid var(--background-modifier-border)', padding: '10px', borderRadius: '4px', cursor: 'text', overflowY: 'auto' }}
            onClick={() => setIsFocused(true)}
        >
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {(() => {
                    if (!value) return <span style={{ color: 'var(--text-faint)' }}>{"{\n  \"key\": \"value\"\n}"}</span>;
                    const formatted = formatAndHighlightResponseBody(value, '');
                    if (formatted.isHtml) {
                        return <code dangerouslySetInnerHTML={{ __html: formatted.content }} />;
                    }
                    return formatted.content;
                })()}
            </pre>
        </div>
    );
};

const RequestEditor = ({ request, collectionData, onChange, onExtract }: any) => {
    const [activeTab, setActiveTab] = React.useState('Params');
    const [response, setResponse] = React.useState<any>(null);
    const [loading, setLoading] = React.useState(false);
    const [loadingStatus, setLoadingStatus] = React.useState<string>('');
    const [responseMode, setResponseMode] = React.useState<'raw' | 'preview'>('raw');
    const [responseHeight, setResponseHeight] = React.useState(35); // Percentage
    const [responseSubTab, setResponseSubTab] = React.useState<'Body' | 'Headers' | 'Cookies' | 'Pre-req Logs'>('Body');

    const [localName, setLocalName] = React.useState(request.name);
    const tabsRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        setLocalName(request.name);
    }, [request.id, request.name]);

    const startResizing = React.useCallback((e: any) => {
        e.preventDefault();
        const startY = e.clientY;
        const startHeight = responseHeight;
        const containerHeight = document.querySelector('.postman-main')?.clientHeight || 1000;

        const doDrag = (dragEvent: any) => {
            const deltaY = startY - dragEvent.clientY;
            const deltaPercent = (deltaY / containerHeight) * 100;
            setResponseHeight(Math.min(Math.max(startHeight + deltaPercent, 10), 85));
        };

        const stopDrag = () => {
            document.removeEventListener('mousemove', doDrag);
            document.removeEventListener('mouseup', stopDrag);
        };

        document.addEventListener('mousemove', doDrag);
        document.addEventListener('mouseup', stopDrag);
    }, [responseHeight]);

    const handleSend = async () => {
        setLoading(true);
        setLoadingStatus('');
        setResponse(null);
        try {
            // executeWithDependencies handles the actual request AND its dependencies recursively,
            // as well as inline mutation of collectionData to satisfy dependency chains.
            const res = await executeWithDependencies(request.id, collectionData, onExtract, (status) => setLoadingStatus(status));
            setResponse(res);
        } catch (e: any) {
            setResponse({ error: e.message });
        }
        setLoading(false);
        setLoadingStatus('');
    };

    const updateVariableList = (listKey: 'queryParams' | 'headers' | 'bodyFormUrlEncoded', index: number, field: string, value: any) => {
        const newList = [...request[listKey]];
        newList[index] = { ...newList[index], [field]: value };

        const updatedReq = { ...request, [listKey]: newList };

        // Sync URL if Query Params changed
        if (listKey === 'queryParams') {
            try {
                // We only do a basic reconstruction if it's a valid URL or just a path
                let baseUrl = updatedReq.url.split('?')[0];
                const activeParams = newList.filter((p: any) => p.enabled && p.key);
                if (activeParams.length > 0) {
                    const qs = activeParams.map((p: any) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&');
                    updatedReq.url = `${baseUrl}?${qs}`;
                } else {
                    updatedReq.url = baseUrl;
                }
            } catch (e) {}
        }

        onChange(updatedReq);
    };

    const handleUrlChange = (newUrl: string) => {
        let updatedReq = { ...request, url: newUrl };
        try {
            // Very basic URL parser that splits by ? to extract query params
            const parts = newUrl.split('?');
            if (parts.length > 1) {
                const qs = parts[1];
                const pairs = qs.split('&');
                const newParams: Variable[] = pairs.map(pair => {
                    const [k, v] = pair.split('=');
                    return { key: decodeURIComponent(k || ''), value: decodeURIComponent(v || ''), enabled: true };
                }).filter(p => p.key);
                updatedReq.queryParams = newParams;
            } else {
                updatedReq.queryParams = [];
            }
        } catch (e) {}
        onChange(updatedReq);
    };

    const [showHiddenHeaders, setShowHiddenHeaders] = React.useState(false);

    const renderVariableList = (listKey: 'queryParams' | 'headers' | 'bodyFormUrlEncoded') => {
        const items = request[listKey] || [];
        const normalItems = listKey === 'headers' ? items.filter((i: any) => !i.auto) : items;
        const autoItems = listKey === 'headers' ? items.filter((i: any) => i.auto) : [];

        return (
            <div>
                {normalItems.map((item: Variable, i: number) => {
                    const actualIndex = items.findIndex((orig: any) => orig === item);
                    return (
                        <div key={actualIndex} className="postman-kv-row">
                            <input type="checkbox" checked={item.enabled} onChange={(e) => updateVariableList(listKey, actualIndex, 'enabled', e.target.checked)} />
                            <HighlightedInput
                                className="postman-kv-input" style={{ flex: 1 }}
                                placeholder="Key" value={item.key}
                                onChange={(val: string) => updateVariableList(listKey, actualIndex, 'key', val)}
                                collectionData={collectionData}
                            />
                            <HighlightedInput
                                className="postman-kv-input" style={{ flex: 2 }}
                                placeholder="Value" value={item.value}
                                onChange={(val: string) => updateVariableList(listKey, actualIndex, 'value', val)}
                                collectionData={collectionData}
                            />
                            <button className="btn-ghost" onClick={() => {
                                const newList = [...request[listKey]]; newList.splice(actualIndex, 1); onChange({ ...request, [listKey]: newList });
                            }}>×</button>
                        </div>
                    );
                })}
                <button className="btn-ghost" style={{ marginTop: '10px', border: '1px solid var(--background-modifier-border) !important' }} onClick={() => onChange({ ...request, [listKey]: [...request[listKey], { key: '', value: '', enabled: true }] })}>
                    + Add
                </button>

                {listKey === 'headers' && autoItems.length > 0 && (
                    <div style={{ marginTop: '20px', borderTop: '1px dashed var(--background-modifier-border)', paddingTop: '10px' }}>
                        <button className="btn-ghost" style={{ fontSize: '11px', padding: 0, color: 'var(--text-muted)' }} onClick={() => setShowHiddenHeaders(!showHiddenHeaders)}>
                            {showHiddenHeaders ? '▼ Hide' : '▶ Show'} auto-generated headers
                        </button>
                        {showHiddenHeaders && (
                            <div style={{ marginTop: '10px', opacity: 0.8 }}>
                                {autoItems.map((item: Variable, i: number) => {
                                    const actualIndex = items.findIndex((orig: any) => orig === item);
                                    return (
                                        <div key={actualIndex} className="postman-kv-row">
                                            <input type="checkbox" checked={item.enabled} onChange={(e) => updateVariableList(listKey, actualIndex, 'enabled', e.target.checked)} />
                                            <input className="postman-kv-input" style={{ flex: 1 }} value={item.key} onChange={(e) => updateVariableList(listKey, actualIndex, 'key', e.target.value)} disabled />
                                            <HighlightedInput
                                                className="postman-kv-input" style={{ flex: 2 }}
                                                placeholder="Value" value={item.value}
                                                onChange={(val: string) => updateVariableList(listKey, actualIndex, 'value', val)}
                                                collectionData={collectionData}
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', minWidth: 0 }}>
            <div className="postman-editor-header">
                <input
                    className="postman-request-title-input"
                    value={localName}
                    onChange={(e) => setLocalName(e.target.value)}
                    onBlur={() => { if (localName !== request.name) onChange({ ...request, name: localName }); }}
                    onKeyDown={(e) => { if(e.key === 'Enter') { e.currentTarget.blur(); } }}
                    placeholder="Request Name"
                />

                <div className="postman-url-bar">
                    <select value={request.method} onChange={(e) => onChange({ ...request, method: e.target.value })}>
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
                    />
                    <button onClick={handleSend} disabled={loading}>
                        {loading ? <span className="loading-spinner"></span> : 'Send'}
                    </button>
                </div>
            </div>

            <div
                className="postman-tabs-header"
                ref={tabsRef}
                onWheel={(e) => {
                    if (tabsRef.current) {
                        e.preventDefault();
                        tabsRef.current.scrollLeft += e.deltaY;
                    }
                }}
            >
                {['Params', 'Auth', 'Headers', 'Body', 'Variables', 'Pre-req', 'Extract', 'Settings'].map(tab => {
                    let hasData = false;
                    if (tab === 'Params') hasData = request.queryParams?.some((p: any) => p.key || p.value);
                    if (tab === 'Headers') hasData = request.headers?.some((p: any) => p.key || p.value) || Object.values(request.autoHeaders || {}).some((h: any) => !h.enabled);
                    if (tab === 'Auth') hasData = request.auth?.type !== 'none';
                    if (tab === 'Body') hasData = request.bodyType !== 'none';
                    if (tab === 'Variables') hasData = request.localVariables && request.localVariables.length > 0;
                    if (tab === 'Pre-req') hasData = request.dependencies && request.dependencies.length > 0;
                    if (tab === 'Extract') hasData = request.extractionRules && request.extractionRules.length > 0;

                    return (
                        <div key={tab} className={`postman-tab ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)} style={{ position: 'relative' }}>
                            {tab}
                            {hasData && <span style={{ position: 'absolute', top: '8px', right: '-2px', width: '6px', height: '6px', backgroundColor: 'var(--interactive-accent)', borderRadius: '50%' }}></span>}
                        </div>
                    );
                })}
            </div>

            <div className="postman-tab-content">
                {activeTab === 'Params' && renderVariableList('queryParams')}
                {activeTab === 'Headers' && renderVariableList('headers')}
                {activeTab === 'Variables' && renderVariableList('localVariables' as any)}
                {activeTab === 'Auth' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <label style={{ fontWeight: 'bold' }}>Auth Type:</label>
                            <select
                                className="postman-kv-input"
                                value={request.auth?.type || 'none'}
                                onChange={(e) => onChange({ ...request, auth: { ...request.auth, type: e.target.value } })}
                            >
                                <option value="none">No Auth</option>
                                <option value="basic">Basic Auth</option>
                                <option value="bearer">Bearer Token</option>
                                <option value="apikey">API Key</option>
                            </select>
                        </div>
                        {request.auth?.type === 'basic' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '400px' }}>
                                <HighlightedInput className="postman-kv-input" placeholder="Username (e.g. {{username}})" value={request.auth?.basicUsername || ''} onChange={(val: string) => onChange({ ...request, auth: { ...request.auth, basicUsername: val } })} collectionData={collectionData} />
                                <HighlightedInput className="postman-kv-input" placeholder="Password (e.g. {{password}})" value={request.auth?.basicPassword || ''} onChange={(val: string) => onChange({ ...request, auth: { ...request.auth, basicPassword: val } })} collectionData={collectionData} />
                            </div>
                        )}
                        {request.auth?.type === 'bearer' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '400px' }}>
                                <HighlightedInput className="postman-kv-input" placeholder="Token (e.g. {{bearerToken}})" value={request.auth?.bearerToken || ''} onChange={(val: string) => onChange({ ...request, auth: { ...request.auth, bearerToken: val } })} collectionData={collectionData} />
                            </div>
                        )}
                        {request.auth?.type === 'apikey' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '400px' }}>
                                <HighlightedInput className="postman-kv-input" placeholder="Key" value={request.auth?.apiKeyKey || ''} onChange={(val: string) => onChange({ ...request, auth: { ...request.auth, apiKeyKey: val } })} collectionData={collectionData} />
                                <HighlightedInput className="postman-kv-input" placeholder="Value (e.g. {{apiKey}})" value={request.auth?.apiKeyValue || ''} onChange={(val: string) => onChange({ ...request, auth: { ...request.auth, apiKeyValue: val } })} collectionData={collectionData} />
                                <select className="postman-kv-input" value={request.auth?.apiKeyAddTo || 'header'} onChange={(e) => onChange({ ...request, auth: { ...request.auth, apiKeyAddTo: e.target.value } })}>
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
                            <input type="checkbox" checked={request.settings?.followRedirects ?? true} onChange={(e) => onChange({ ...request, settings: { ...request.settings, followRedirects: e.target.checked } })} />
                            Follow Redirects
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <label>Max Redirects:</label>
                            <input type="number" className="postman-kv-input" style={{ width: '80px' }} value={request.settings?.maxRedirects ?? 5} onChange={(e) => onChange({ ...request, settings: { ...request.settings, maxRedirects: parseInt(e.target.value) || 5 } })} />
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <input type="checkbox" checked={request.settings?.verifySsl ?? true} onChange={(e) => onChange({ ...request, settings: { ...request.settings, verifySsl: e.target.checked } })} />
                            Verify SSL Certificates
                        </label>
                    </div>
                )}
                {activeTab === 'Body' && (
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                        <div style={{ marginBottom: '15px', display: 'flex', gap: '15px', fontSize: '0.9em', flexWrap: 'wrap', alignItems: 'center' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><input type="radio" checked={request.bodyType === 'none'} onChange={() => onChange({ ...request, bodyType: 'none' })} /> none</label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><input type="radio" checked={request.bodyType === 'json'} onChange={() => onChange({ ...request, bodyType: 'json' })} /> raw (JSON)</label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><input type="radio" checked={request.bodyType === 'form-data'} onChange={() => onChange({ ...request, bodyType: 'form-data' })} /> form-data</label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><input type="radio" checked={request.bodyType === 'x-www-form-urlencoded'} onChange={() => onChange({ ...request, bodyType: 'x-www-form-urlencoded' })} /> x-www-form-urlencoded</label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><input type="radio" checked={request.bodyType === 'binary'} onChange={() => onChange({ ...request, bodyType: 'binary' })} /> binary</label>
                            {request.bodyType === 'json' && (
                                <button className="btn-ghost" style={{ marginLeft: 'auto', fontSize: '11px', border: '1px solid var(--background-modifier-border) !important' }} onClick={() => {
                                    try {
                                        const parsed = JSON.parse(request.bodyRaw);
                                        onChange({ ...request, bodyRaw: JSON.stringify(parsed, null, 2) });
                                    } catch (e) {
                                        if (request.bodyRaw.trim().startsWith('<')) {
                                            let formatted = '';
                                            let pad = 0;
                                            request.bodyRaw.split(/(?=(?:<[^>]+>))/).forEach((node: string) => {
                                                if (node.match(/^<\w[^>]*[^\/]>.*$/)) {
                                                    formatted += '  '.repeat(pad) + node + '\n';
                                                    pad += 1;
                                                } else if (node.match(/^<\/\w/)) {
                                                    if (pad !== 0) pad -= 1;
                                                    formatted += '  '.repeat(pad) + node + '\n';
                                                } else {
                                                    formatted += '  '.repeat(pad) + node + '\n';
                                                }
                                            });
                                            onChange({ ...request, bodyRaw: formatted.trim() });
                                        } else {
                                            new Notice("Cannot prettify: Invalid JSON or XML");
                                        }
                                    }
                                }}>Prettify</button>
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
                                {request.bodyFormData.map((fd: any, i: number) => (
                                    <div key={i} className="postman-kv-row">
                                        <input type="checkbox" checked={fd.enabled} onChange={(e) => {
                                            const newFd = [...request.bodyFormData]; newFd[i].enabled = e.target.checked; onChange({ ...request, bodyFormData: newFd });
                                        }} />
                                        <select className="postman-kv-input" value={fd.type} onChange={(e) => {
                                            const newFd = [...request.bodyFormData]; newFd[i].type = e.target.value; onChange({ ...request, bodyFormData: newFd });
                                        }}>
                                            <option value="text">Text</option>
                                            <option value="file">File</option>
                                        </select>
                                        <input className="postman-kv-input" style={{ flex: 1 }} placeholder="Key" value={fd.key} onChange={(e) => {
                                            const newFd = [...request.bodyFormData]; newFd[i].key = e.target.value; onChange({ ...request, bodyFormData: newFd });
                                        }} />
                                        {fd.type === 'file' ? (
                                            <input className="postman-kv-input" style={{ flex: 2, padding: '4px' }} type="file" onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) {
                                                    const newFd = [...request.bodyFormData]; newFd[i].value = (file as any).path; onChange({ ...request, bodyFormData: newFd });
                                                }
                                            }} />
                                        ) : (
                                            <input className="postman-kv-input" style={{ flex: 2 }} placeholder="Value" value={fd.value} onChange={(e) => {
                                                const newFd = [...request.bodyFormData]; newFd[i].value = e.target.value; onChange({ ...request, bodyFormData: newFd });
                                            }} />
                                        )}
                                        <button className="btn-ghost" onClick={() => {
                                            const newFd = [...request.bodyFormData]; newFd.splice(i, 1); onChange({ ...request, bodyFormData: newFd });
                                        }}>×</button>
                                    </div>
                                ))}
                                <button className="btn-ghost" style={{ marginTop: '10px', border: '1px solid var(--background-modifier-border) !important' }} onClick={() => onChange({ ...request, bodyFormData: [...request.bodyFormData, { key: '', value: '', type: 'text', enabled: true }] })}>
                                    + Add Item
                                </button>
                            </div>
                        )}
                            {request.bodyType === 'x-www-form-urlencoded' && renderVariableList('bodyFormUrlEncoded')}
                            {request.bodyType === 'binary' && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '20px', border: '1px dashed var(--background-modifier-border)', borderRadius: '4px' }}>
                                    <input type="file" onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                            onChange({ ...request, bodyBinaryPath: (file as any).path });
                                        }
                                    }} />
                                    <span style={{ color: 'var(--text-muted)' }}>{request.bodyBinaryPath || 'No file selected'}</span>
                                </div>
                            )}
                    </div>
                )}
                {activeTab === 'Extract' && (
                    <div>
                        <p style={{ fontSize: '0.9em', color: 'var(--text-muted)', marginBottom: '15px' }}>Extract values from JSON responses using <a href="https://github.com/JSONPath-Plus/JSONPath" target="_blank" rel="noopener noreferrer">JSONPath</a> to save them into your active environment.</p>
                        {request.extractionRules.map((rule: ExtractionRule, i: number) => (
                            <div key={i} className="postman-kv-row">
                                <input className="postman-kv-input" style={{ flex: 1 }} placeholder="Variable Name (e.g., token)" value={rule.name} onChange={(e) => {
                                    const newRules = [...request.extractionRules]; newRules[i].name = e.target.value; onChange({ ...request, extractionRules: newRules });
                                }} />
                                <input className="postman-kv-input" style={{ flex: 2 }} placeholder="JSONPath (e.g., $.data.token)" value={rule.jsonPath} onChange={(e) => {
                                    const newRules = [...request.extractionRules]; newRules[i].jsonPath = e.target.value; onChange({ ...request, extractionRules: newRules });
                                }} />
                                <button className="btn-ghost" onClick={() => {
                                    const newRules = [...request.extractionRules]; newRules.splice(i, 1); onChange({ ...request, extractionRules: newRules });
                                }}>×</button>
                            </div>
                        ))}
                        <button className="btn-ghost" style={{ marginTop: '10px', border: '1px solid var(--background-modifier-border) !important' }} onClick={() => onChange({ ...request, extractionRules: [...request.extractionRules, { id: Date.now().toString(), name: '', jsonPath: '$' }] })}>
                            + Add Rule
                        </button>
                    </div>
                )}
                {activeTab === 'Pre-req' && (
                    <PreRequestsTab request={request} collectionData={collectionData} onChange={onChange} />
                )}
            </div>

            <div className="postman-resizer" onMouseDown={startResizing} title="Drag to resize response view"></div>

            <div className="postman-response-area" style={{ height: `${responseHeight}%` }}>
                <div className="postman-response-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={{ display: 'flex', gap: '10px', fontWeight: 600 }}>
                            {['Body', 'Headers', 'Cookies', 'Pre-req Logs'].map(subTab => (
                                <span
                                    key={subTab}
                                    style={{
                                        cursor: 'pointer',
                                        color: responseSubTab === subTab ? 'var(--text-normal)' : 'var(--text-muted)',
                                        borderBottom: responseSubTab === subTab ? '2px solid var(--interactive-accent)' : 'none'
                                    }}
                                    onClick={() => setResponseSubTab(subTab as any)}
                                >
                                    {subTab}
                                </span>
                            ))}
                        </div>
                        {response && response.response && responseSubTab === 'Body' && (
                            <div style={{ display: 'flex', gap: '5px' }}>
                                <button className={`btn-ghost ${responseMode === 'raw' ? 'active' : ''}`} style={{ fontSize: '10px', background: responseMode === 'raw' ? 'var(--background-modifier-active-hover)' : 'transparent' }} onClick={() => setResponseMode('raw')}>Raw</button>
                                <button className={`btn-ghost ${responseMode === 'preview' ? 'active' : ''}`} style={{ fontSize: '10px', background: responseMode === 'preview' ? 'var(--background-modifier-active-hover)' : 'transparent' }} onClick={() => setResponseMode('preview')}>Preview</button>
                            </div>
                        )}
                    </div>
                    {response && response.response && (
                        <div className="postman-response-status">
                            <span>Status: <span className={`postman-badge ${response.response.status >= 200 && response.response.status < 300 ? 'success' : 'error'}`}>{response.response.status}</span></span>
                            <span style={{ color: 'var(--text-muted)' }}>Time: {response.timeMs} ms</span>
                        </div>
                    )}
                </div>
                <div className="postman-response-body" style={{ padding: responseMode === 'preview' && responseSubTab === 'Body' ? '0' : '15px 20px' }}>
                    {loading && <div style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px', padding: '15px 20px' }}><span className="loading-spinner"></span> {loadingStatus || 'Waiting for response...'}</div>}
                    {!loading && !response && <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', marginTop: '20px' }}>Enter the URL and click Send to get a response</div>}
                    {!loading && response && response.error && <div style={{ color: 'var(--color-red)', padding: '15px 20px' }}>Error: {response.error}</div>}
                    {!loading && response && (
                        <>
                            {response.response && responseSubTab === 'Body' && responseMode === 'raw' && (
                                <pre>
                                    {(() => {
                                        if (response.response.isBinary) {
                                            return `<Binary data: ${response.response.contentType}>`;
                                        }
                                        const formatted = formatAndHighlightResponseBody(response.response.text, response.response.contentType);
                                        if (formatted.isHtml) {
                                            return <code dangerouslySetInnerHTML={{ __html: formatted.content }} />;
                                        }
                                        return formatted.content;
                                    })()}
                                </pre>
                            )}
                            {response.response && responseSubTab === 'Body' && responseMode === 'preview' && (
                                <div style={{ width: '100%', height: '100%', background: 'white' }}>
                                    {response.response.contentType?.includes('image') ? (
                                        <img
                                            src={URL.createObjectURL(new Blob([response.response.arrayBuffer], { type: response.response.contentType }))}
                                            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                                        />
                                    ) : (
                                        <iframe
                                            srcDoc={response.response.text}
                                            style={{ width: '100%', height: '100%', border: 'none', background: 'white' }}
                                            sandbox="allow-scripts"
                                        />
                                    )}
                                </div>
                            )}

                            {response.response && responseSubTab === 'Headers' && (
                                <div>
                                    {Object.entries(response.response.headers || {}).map(([key, val]: [string, any], i) => (
                                        <div key={i} className="postman-kv-row">
                                            <input className="postman-kv-input" style={{ flex: 1, fontWeight: 'bold' }} readOnly value={key} />
                                            <input className="postman-kv-input" style={{ flex: 2 }} readOnly value={val} />
                                        </div>
                                    ))}
                                </div>
                            )}

                            {response.response && responseSubTab === 'Cookies' && (
                                <div>
                                    {(() => {
                                        const cookies: string[] = Array.isArray(response.response.headers['set-cookie'])
                                            ? response.response.headers['set-cookie']
                                            : response.response.headers['set-cookie'] ? [response.response.headers['set-cookie']] : [];

                                        if (cookies.length === 0) return <div style={{ color: 'var(--text-muted)' }}>No cookies returned.</div>;

                                        return cookies.map((cookieStr: string, i: number) => {
                                            const parts = cookieStr.split(';');
                                            const [nameVal] = parts;
                                            const [name, val] = nameVal.split('=');
                                            return (
                                                <div key={i} className="postman-kv-row" style={{ marginBottom: '10px' }}>
                                                    <input className="postman-kv-input" style={{ flex: 1, fontWeight: 'bold' }} readOnly value={name} />
                                                    <input className="postman-kv-input" style={{ flex: 2 }} readOnly value={val || ''} />
                                                </div>
                                            );
                                        });
                                    })()}
                                </div>
                            )}

                            {responseSubTab === 'Pre-req Logs' && (
                                <div>
                                    {response.logs && response.logs.length > 0 ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            {response.logs.map((log: any, i: number) => (
                                                <details key={i} style={{ border: '1px solid var(--background-modifier-border)', borderRadius: '4px', overflow: 'hidden' }}>
                                                    <summary style={{ background: 'var(--background-secondary)', padding: '4px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', outline: 'none' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <span className={`postman-badge ${log.status >= 200 && log.status < 300 ? 'success' : 'error'}`} style={{ fontSize: '9px', padding: '1px 4px' }}>{log.status || 'ERR'}</span>
                                                            <span style={{ fontWeight: '600', fontSize: '12px' }}>{log.requestName}</span>
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', fontSize: '11px' }}>
                                                            <span style={{ color: 'var(--color-orange)' }}>{log.extractedVariables.length > 0 ? `+${log.extractedVariables.length} vars` : ''}</span>
                                                            <span style={{ color: 'var(--text-muted)' }}>{log.timeMs}ms</span>
                                                        </div>
                                                    </summary>
                                                    <div style={{ padding: '8px', fontSize: '11px', borderTop: '1px solid var(--background-modifier-border)' }}>
                                                        {log.error ? (
                                                            <div style={{ color: 'var(--color-red)' }}>{log.error}</div>
                                                        ) : (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                                {log.extractedVariables.length > 0 && (
                                                                    <div>
                                                                        <span style={{ color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '10px' }}>Extracted</span>
                                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
                                                                            {log.extractedVariables.map((v: any, j: number) => (
                                                                                <span key={j} style={{ background: 'var(--background-primary-alt)', padding: '2px 4px', borderRadius: '3px', border: '1px solid var(--background-modifier-border-hover)' }}>
                                                                                    <span style={{ color: 'var(--color-orange)', marginRight: '4px' }}>{v.key}:</span>
                                                                                    <span style={{ color: 'var(--text-normal)' }}>{v.value}</span>
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                                <div>
                                                                    <span style={{ color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '10px' }}>Body</span>
                                                                    <pre style={{ marginTop: '4px', maxHeight: '120px', overflowY: 'auto', background: 'var(--background-primary-alt)', padding: '6px', borderRadius: '4px' }}>
                                                                        {(() => {
                                                                            const formatted = formatAndHighlightResponseBody(log.responseBody, '');
                                                                            if (formatted.isHtml) {
                                                                                return <code dangerouslySetInnerHTML={{ __html: formatted.content }} />;
                                                                            }
                                                                            return formatted.content;
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
                                        <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No dependency logs.</div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
