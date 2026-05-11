import * as React from 'react';
import { JSONPath } from 'jsonpath-plus';
import { CollectionData, RequestItem, Environment, ExtractionRule, Variable } from '../types';
import { executeRequest } from '../network';

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

    React.useEffect(() => {
        setCollectionData(data);
    }, [data]);

    const handleSave = (newData: CollectionData) => {
        setCollectionData(newData);
        onSave(newData);
    };

    const activeReq = collectionData.requests.find(r => r.id === activeReqId);

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
            extractionRules: []
        };
        handleSave({ ...collectionData, requests: [...collectionData.requests, newReq] });
        setActiveReqId(newReq.id);
        if (window.innerWidth <= 768) setMobileSidebarOpen(false);
    };

    return (
        <div className="postman-clone-root">
            <div className={`postman-sidebar ${mobileSidebarOpen ? 'mobile-open' : ''}`}>
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

                <div className="postman-request-list">
                    {collectionData.requests.map((req: RequestItem) => (
                        <div key={req.id}
                             onClick={() => { setActiveReqId(req.id); if (window.innerWidth <= 768) setMobileSidebarOpen(false); }}
                             className={`postman-request-item ${activeReqId === req.id ? 'active' : ''}`}>
                            <div style={{ display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
                                <span className={`postman-method-badge method-${req.method}`}>{req.method}</span>
                                <span style={{ fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{req.name}</span>
                            </div>
                            <button className="btn-ghost" onClick={(e) => {
                                e.stopPropagation();
                                const newReqs = collectionData.requests.filter(r => r.id !== req.id);
                                handleSave({ ...collectionData, requests: newReqs });
                                if (activeReqId === req.id) setActiveReqId(newReqs.length > 0 ? newReqs[0].id : null);
                            }}>×</button>
                        </div>
                    ))}
                    <button style={{ width: '100%', marginTop: '10px', background: 'transparent', border: '1px dashed var(--background-modifier-border)', color: 'var(--text-muted)', padding: '8px', borderRadius: '4px', cursor: 'pointer' }} onClick={addNewRequest}>
                        + Add Request
                    </button>
                </div>
            </div>

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
                        onExtract={(envId: string, key: string, value: string) => {
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

const RequestEditor = ({ request, collectionData, onChange, onExtract }: any) => {
    const [activeTab, setActiveTab] = React.useState('Params');
    const [response, setResponse] = React.useState<any>(null);
    const [loading, setLoading] = React.useState(false);

    const handleSend = async () => {
        setLoading(true);
        setResponse(null);
        try {
            const res = await executeRequest(request, collectionData);
            setResponse(res);

            if (res.response && res.response.json) {
                request.extractionRules.forEach((rule: ExtractionRule) => {
                    try {
                        const result = JSONPath({ path: rule.jsonPath, json: res.response.json });
                        if (result && result.length > 0) {
                            const val = typeof result[0] === 'object' ? JSON.stringify(result[0]) : String(result[0]);
                            const targetEnvId = rule.targetEnvironmentId || collectionData.activeEnvironmentId;
                            if (targetEnvId) onExtract(targetEnvId, rule.name, val);
                        }
                    } catch (e) {}
                });
            }
        } catch (e: any) {
            setResponse({ error: e.message });
        }
        setLoading(false);
    };

    const updateVariableList = (listKey: 'queryParams' | 'headers', index: number, field: string, value: any) => {
        const newList = [...request[listKey]];
        newList[index] = { ...newList[index], [field]: value };
        onChange({ ...request, [listKey]: newList });
    };

    const renderVariableList = (listKey: 'queryParams' | 'headers') => (
        <div>
            {request[listKey].map((item: Variable, i: number) => (
                <div key={i} className="postman-kv-row">
                    <input type="checkbox" checked={item.enabled} onChange={(e) => updateVariableList(listKey, i, 'enabled', e.target.checked)} />
                    <HighlightedInput
                        className="postman-kv-input" style={{ flex: 1 }}
                        placeholder="Key" value={item.key}
                        onChange={(val: string) => updateVariableList(listKey, i, 'key', val)}
                        collectionData={collectionData}
                    />
                    <HighlightedInput
                        className="postman-kv-input" style={{ flex: 2 }}
                        placeholder="Value" value={item.value}
                        onChange={(val: string) => updateVariableList(listKey, i, 'value', val)}
                        collectionData={collectionData}
                    />
                    <button className="btn-ghost" onClick={() => {
                        const newList = [...request[listKey]]; newList.splice(i, 1); onChange({ ...request, [listKey]: newList });
                    }}>×</button>
                </div>
            ))}
            <button className="btn-ghost" style={{ marginTop: '10px', border: '1px solid var(--background-modifier-border) !important' }} onClick={() => onChange({ ...request, [listKey]: [...request[listKey], { key: '', value: '', enabled: true }] })}>
                + Add
            </button>
        </div>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            <div className="postman-editor-header">
                <input
                    className="postman-request-title-input"
                    value={request.name}
                    onChange={(e) => onChange({ ...request, name: e.target.value })}
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
                        onChange={(val: string) => onChange({ ...request, url: val })}
                        placeholder="Enter request URL"
                        collectionData={collectionData}
                    />
                    <button onClick={handleSend} disabled={loading}>
                        {loading ? <span className="loading-spinner"></span> : 'Send'}
                    </button>
                </div>
            </div>

            <div className="postman-tabs-header">
                {['Params', 'Headers', 'Body', 'Extract'].map(tab => (
                    <div key={tab} className={`postman-tab ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
                        {tab}
                    </div>
                ))}
            </div>

            <div className="postman-tab-content">
                {activeTab === 'Params' && renderVariableList('queryParams')}
                {activeTab === 'Headers' && renderVariableList('headers')}
                {activeTab === 'Body' && (
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                        <div style={{ marginBottom: '15px', display: 'flex', gap: '15px', fontSize: '0.9em' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><input type="radio" checked={request.bodyType === 'none'} onChange={() => onChange({ ...request, bodyType: 'none' })} /> none</label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><input type="radio" checked={request.bodyType === 'json'} onChange={() => onChange({ ...request, bodyType: 'json' })} /> raw (JSON)</label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><input type="radio" checked={request.bodyType === 'form-data'} onChange={() => onChange({ ...request, bodyType: 'form-data' })} /> form-data</label>
                        </div>
                        {request.bodyType === 'json' && (
                            <textarea
                                style={{ flex: 1, width: '100%', fontFamily: 'var(--font-monospace)', background: 'var(--background-primary)', color: 'var(--text-normal)', border: '1px solid var(--background-modifier-border)', padding: '10px', borderRadius: '4px', resize: 'none' }}
                                value={request.bodyRaw}
                                onChange={(e) => onChange({ ...request, bodyRaw: e.target.value })}
                                placeholder={"{\n  \"key\": \"value\"\n}"}
                            />
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
            </div>

            <div className="postman-response-area">
                <div className="postman-response-header">
                    <span style={{ fontWeight: 600 }}>Response</span>
                    {response && response.response && (
                        <div className="postman-response-status">
                            <span>Status: <span className={`postman-badge ${response.response.status >= 200 && response.response.status < 300 ? 'success' : 'error'}`}>{response.response.status}</span></span>
                            <span style={{ color: 'var(--text-muted)' }}>Time: {response.timeMs} ms</span>
                        </div>
                    )}
                </div>
                <div className="postman-response-body">
                    {loading && <div style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}><span className="loading-spinner"></span> Waiting for response...</div>}
                    {!loading && !response && <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', marginTop: '20px' }}>Enter the URL and click Send to get a response</div>}
                    {!loading && response && response.error && <div style={{ color: 'var(--color-red)' }}>Error: {response.error}</div>}
                    {!loading && response && response.response && (
                        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                            {(() => {
                                if (response.response.json) {
                                    try {
                                        return JSON.stringify(response.response.json, null, 2);
                                    } catch(e) {
                                        return response.response.text;
                                    }
                                }
                                return response.response.text;
                            })()}
                        </pre>
                    )}
                </div>
            </div>
        </div>
    );
};
