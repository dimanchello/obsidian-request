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
    };

    return (
        <div className="postman-clone-root" style={{ display: 'flex', height: '100%', width: '100%', fontFamily: 'var(--font-interface)' }}>
            <div className="sidebar" style={{ width: '250px', borderRight: '1px solid var(--background-modifier-border)', padding: '10px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ marginBottom: '15px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Environment</label>
                        <button style={{ fontSize: '10px', padding: '2px 5px', background: 'transparent', border: '1px solid var(--background-modifier-border)' }} onClick={() => setShowEnvManager(!showEnvManager)}>
                            ⚙️ Manage
                        </button>
                    </div>
                    <select
                        style={{ width: '100%', background: 'var(--background-modifier-form-field)', color: 'var(--text-normal)' }}
                        value={collectionData.activeEnvironmentId || ''}
                        onChange={(e) => handleSave({ ...collectionData, activeEnvironmentId: e.target.value })}
                    >
                        {collectionData.environments.map((env: Environment) => (
                            <option key={env.id} value={env.id}>{env.name}</option>
                        ))}
                    </select>
                </div>

                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {collectionData.requests.map((req: RequestItem) => (
                        <div key={req.id} onClick={() => setActiveReqId(req.id)} className="postman-request-item" style={{ cursor: 'pointer', padding: '5px', borderRadius: '4px', background: activeReqId === req.id ? 'var(--background-modifier-active-hover)' : 'transparent', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                <span style={{ fontSize: '10px', fontWeight: 'bold', marginRight: '5px', color: req.method === 'GET' ? 'var(--color-green)' : req.method === 'POST' ? 'var(--color-yellow)' : req.method === 'DELETE' ? 'var(--color-red)' : 'var(--text-accent)' }}>{req.method}</span>
                                <span style={{ fontSize: '14px' }}>{req.name}</span>
                            </div>
                            <button style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)' }} onClick={(e) => {
                                e.stopPropagation();
                                const newReqs = collectionData.requests.filter(r => r.id !== req.id);
                                handleSave({ ...collectionData, requests: newReqs });
                                if (activeReqId === req.id) setActiveReqId(newReqs.length > 0 ? newReqs[0].id : null);
                            }}>×</button>
                        </div>
                    ))}
                </div>
                <button style={{ marginTop: '10px', background: 'var(--interactive-accent)', color: 'var(--text-on-accent)', border: 'none', padding: '8px', borderRadius: '4px', cursor: 'pointer' }} onClick={addNewRequest}>
                    + Add Request
                </button>
            </div>

            <div style={{ flex: 1, padding: '20px', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                {showEnvManager ? (
                    <EnvironmentManager collectionData={collectionData} onSave={handleSave} onClose={() => setShowEnvManager(false)} />
                ) : activeReq ? (
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
        const newEnv: Environment = { id: Date.now().toString(), name: 'New Env', variables: [] };
        onSave({ ...collectionData, environments: [...collectionData.environments, newEnv] });
        setActiveEnvId(newEnv.id);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--background-modifier-border)', paddingBottom: '10px', marginBottom: '20px' }}>
                <h2 style={{ margin: 0 }}>Manage Environments</h2>
                <button onClick={onClose}>Close</button>
            </div>
            <div style={{ display: 'flex', flex: 1, gap: '20px' }}>
                <div style={{ width: '200px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    {collectionData.environments.map((env: Environment) => (
                        <div key={env.id} onClick={() => setActiveEnvId(env.id)} style={{ cursor: 'pointer', padding: '5px', background: activeEnvId === env.id ? 'var(--background-modifier-active-hover)' : 'transparent', display: 'flex', justifyContent: 'space-between' }}>
                            {env.name}
                            <button style={{ background: 'transparent', border: 'none', padding: 0 }} onClick={(e) => {
                                e.stopPropagation();
                                const newEnvs = collectionData.environments.filter((e2: Environment) => e2.id !== env.id);
                                onSave({ ...collectionData, environments: newEnvs, activeEnvironmentId: collectionData.activeEnvironmentId === env.id ? null : collectionData.activeEnvironmentId });
                            }}>×</button>
                        </div>
                    ))}
                    <button onClick={addEnv}>+ Add Env</button>
                </div>
                <div style={{ flex: 1, borderLeft: '1px solid var(--background-modifier-border)', paddingLeft: '20px' }}>
                    {activeEnv && (
                        <div>
                            <input
                                style={{ fontSize: '18px', fontWeight: 'bold', background: 'transparent', border: 'none', borderBottom: '1px solid var(--background-modifier-border)', marginBottom: '15px', color: 'var(--text-normal)' }}
                                value={activeEnv.name}
                                onChange={(e) => handleEnvChange({ ...activeEnv, name: e.target.value })}
                            />
                            <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr>
                                        <th style={{ padding: '5px', borderBottom: '1px solid var(--background-modifier-border)' }}></th>
                                        <th style={{ padding: '5px', borderBottom: '1px solid var(--background-modifier-border)' }}>Variable</th>
                                        <th style={{ padding: '5px', borderBottom: '1px solid var(--background-modifier-border)' }}>Value</th>
                                        <th style={{ padding: '5px', borderBottom: '1px solid var(--background-modifier-border)' }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {activeEnv.variables.map((v: Variable, i: number) => (
                                        <tr key={i}>
                                            <td style={{ padding: '5px' }}><input type="checkbox" checked={v.enabled} onChange={(e) => {
                                                const newVars = [...activeEnv.variables]; newVars[i].enabled = e.target.checked; handleEnvChange({ ...activeEnv, variables: newVars });
                                            }}/></td>
                                            <td style={{ padding: '5px' }}><input style={{ width: '100%', background: 'var(--background-modifier-form-field)' }} value={v.key} onChange={(e) => {
                                                const newVars = [...activeEnv.variables]; newVars[i].key = e.target.value; handleEnvChange({ ...activeEnv, variables: newVars });
                                            }}/></td>
                                            <td style={{ padding: '5px' }}><input style={{ width: '100%', background: 'var(--background-modifier-form-field)' }} value={v.value} onChange={(e) => {
                                                const newVars = [...activeEnv.variables]; newVars[i].value = e.target.value; handleEnvChange({ ...activeEnv, variables: newVars });
                                            }}/></td>
                                            <td style={{ padding: '5px' }}><button onClick={() => {
                                                const newVars = [...activeEnv.variables]; newVars.splice(i, 1); handleEnvChange({ ...activeEnv, variables: newVars });
                                            }}>×</button></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <button style={{ marginTop: '10px' }} onClick={() => handleEnvChange({ ...activeEnv, variables: [...activeEnv.variables, { key: '', value: '', enabled: true }] })}>+ Add Variable</button>
                        </div>
                    )}
                </div>
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
                <div key={i} style={{ display: 'flex', gap: '5px', marginBottom: '5px' }}>
                    <input type="checkbox" checked={item.enabled} onChange={(e) => updateVariableList(listKey, i, 'enabled', e.target.checked)} />
                    <input style={{ flex: 1, background: 'var(--background-modifier-form-field)', color: 'var(--text-normal)' }} placeholder="Key" value={item.key} onChange={(e) => updateVariableList(listKey, i, 'key', e.target.value)} />
                    <input style={{ flex: 2, background: 'var(--background-modifier-form-field)', color: 'var(--text-normal)' }} placeholder="Value" value={item.value} onChange={(e) => updateVariableList(listKey, i, 'value', e.target.value)} />
                    <button onClick={() => {
                        const newList = [...request[listKey]]; newList.splice(i, 1); onChange({ ...request, [listKey]: newList });
                    }}>X</button>
                </div>
            ))}
            <button style={{ marginTop: '10px' }} onClick={() => onChange({ ...request, [listKey]: [...request[listKey], { key: '', value: '', enabled: true }] })}>+ Add</button>
        </div>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <input
                style={{ fontSize: '18px', fontWeight: 'bold', background: 'transparent', border: 'none', borderBottom: '1px solid var(--background-modifier-border)', marginBottom: '15px', color: 'var(--text-normal)' }}
                value={request.name}
                onChange={(e) => onChange({ ...request, name: e.target.value })}
                placeholder="Request Name"
            />
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                <select style={{ background: 'var(--background-modifier-form-field)', color: 'var(--text-normal)' }} value={request.method} onChange={(e) => onChange({ ...request, method: e.target.value })}>
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="PATCH">PATCH</option>
                    <option value="DELETE">DELETE</option>
                    <option value="OPTIONS">OPTIONS</option>
                    <option value="HEAD">HEAD</option>
                </select>
                <input style={{ flex: 1, background: 'var(--background-modifier-form-field)', color: 'var(--text-normal)', fontFamily: 'monospace' }} value={request.url} onChange={(e) => onChange({ ...request, url: e.target.value })} placeholder="Enter request URL" />
                <button
                    style={{ background: 'var(--interactive-accent)', color: 'var(--text-on-accent)', border: 'none', padding: '0 20px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                    onClick={handleSend}
                    disabled={loading}
                >
                    {loading ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <span className="loading-spinner"></span> Sending...
                        </span>
                    ) : 'Send'}
                </button>
            </div>

            <div style={{ flex: 1, border: '1px solid var(--background-modifier-border)', borderRadius: '4px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', background: 'var(--background-secondary)', borderBottom: '1px solid var(--background-modifier-border)' }}>
                    {['Params', 'Headers', 'Body', 'Extract'].map(tab => (
                        <div key={tab} onClick={() => setActiveTab(tab)} style={{ padding: '10px 15px', cursor: 'pointer', borderBottom: activeTab === tab ? '2px solid var(--interactive-accent)' : 'none' }}>
                            {tab}
                        </div>
                    ))}
                </div>
                <div style={{ padding: '15px', flex: 1, overflowY: 'auto' }}>
                    {activeTab === 'Params' && renderVariableList('queryParams')}
                    {activeTab === 'Headers' && renderVariableList('headers')}
                    {activeTab === 'Body' && (
                        <div>
                            <div style={{ marginBottom: '10px', display: 'flex', gap: '10px' }}>
                                <label><input type="radio" checked={request.bodyType === 'none'} onChange={() => onChange({ ...request, bodyType: 'none' })} /> None</label>
                                <label><input type="radio" checked={request.bodyType === 'json'} onChange={() => onChange({ ...request, bodyType: 'json' })} /> raw (JSON)</label>
                                <label><input type="radio" checked={request.bodyType === 'form-data'} onChange={() => onChange({ ...request, bodyType: 'form-data' })} /> form-data</label>
                            </div>
                            {request.bodyType === 'json' && (
                                <textarea style={{ width: '100%', height: '150px', fontFamily: 'monospace', background: 'var(--background-modifier-form-field)', color: 'var(--text-normal)' }} value={request.bodyRaw} onChange={(e) => onChange({ ...request, bodyRaw: e.target.value })} />
                            )}
                            {request.bodyType === 'form-data' && (
                                <div>
                                    {request.bodyFormData.map((fd: any, i: number) => (
                                        <div key={i} style={{ display: 'flex', gap: '5px', marginBottom: '5px' }}>
                                            <input type="checkbox" checked={fd.enabled} onChange={(e) => {
                                                const newFd = [...request.bodyFormData]; newFd[i].enabled = e.target.checked; onChange({ ...request, bodyFormData: newFd });
                                            }} />
                                            <select style={{ background: 'var(--background-modifier-form-field)' }} value={fd.type} onChange={(e) => {
                                                const newFd = [...request.bodyFormData]; newFd[i].type = e.target.value; onChange({ ...request, bodyFormData: newFd });
                                            }}>
                                                <option value="text">Text</option>
                                                <option value="file">File</option>
                                            </select>
                                            <input style={{ flex: 1, background: 'var(--background-modifier-form-field)' }} placeholder="Key" value={fd.key} onChange={(e) => {
                                                const newFd = [...request.bodyFormData]; newFd[i].key = e.target.value; onChange({ ...request, bodyFormData: newFd });
                                            }} />
                                            {fd.type === 'file' ? (
                                                <input style={{ flex: 2 }} type="file" onChange={(e) => {
                                                    const file = e.target.files?.[0];
                                                    if (file) {
                                                        const newFd = [...request.bodyFormData]; newFd[i].value = (file as any).path; onChange({ ...request, bodyFormData: newFd });
                                                    }
                                                }} />
                                            ) : (
                                                <input style={{ flex: 2, background: 'var(--background-modifier-form-field)' }} placeholder="Value" value={fd.value} onChange={(e) => {
                                                    const newFd = [...request.bodyFormData]; newFd[i].value = e.target.value; onChange({ ...request, bodyFormData: newFd });
                                                }} />
                                            )}
                                            <button onClick={() => {
                                                const newFd = [...request.bodyFormData]; newFd.splice(i, 1); onChange({ ...request, bodyFormData: newFd });
                                            }}>X</button>
                                        </div>
                                    ))}
                                    <button onClick={() => onChange({ ...request, bodyFormData: [...request.bodyFormData, { key: '', value: '', type: 'text', enabled: true }] })}>+ Add Form Data</button>
                                </div>
                            )}
                        </div>
                    )}
                    {activeTab === 'Extract' && (
                        <div>
                            {request.extractionRules.map((rule: ExtractionRule, i: number) => (
                                <div key={i} style={{ display: 'flex', gap: '5px', marginBottom: '5px' }}>
                                    <input style={{ flex: 1, background: 'var(--background-modifier-form-field)' }} placeholder="Var Name" value={rule.name} onChange={(e) => {
                                        const newRules = [...request.extractionRules]; newRules[i].name = e.target.value; onChange({ ...request, extractionRules: newRules });
                                    }} />
                                    <input style={{ flex: 2, background: 'var(--background-modifier-form-field)' }} placeholder="JSONPath (e.g., $.data.token)" value={rule.jsonPath} onChange={(e) => {
                                        const newRules = [...request.extractionRules]; newRules[i].jsonPath = e.target.value; onChange({ ...request, extractionRules: newRules });
                                    }} />
                                    <button onClick={() => {
                                        const newRules = [...request.extractionRules]; newRules.splice(i, 1); onChange({ ...request, extractionRules: newRules });
                                    }}>X</button>
                                </div>
                            ))}
                            <button onClick={() => onChange({ ...request, extractionRules: [...request.extractionRules, { id: Date.now().toString(), name: '', jsonPath: '$' }] })}>+ Add Rule</button>
                        </div>
                    )}
                </div>
            </div>

            <div style={{ height: '250px', marginTop: '20px', border: '1px solid var(--background-modifier-border)', borderRadius: '4px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '10px', background: 'var(--background-secondary)', borderBottom: '1px solid var(--background-modifier-border)', display: 'flex', justifyContent: 'space-between' }}>
                    <h3 style={{ margin: 0, fontSize: '14px' }}>Response</h3>
                    {response && response.response && (
                        <div style={{ fontSize: '12px', display: 'flex', gap: '15px', color: 'var(--text-muted)' }}>
                            <span>Status: <span style={{ color: response.response.status >= 200 && response.response.status < 300 ? 'var(--color-green)' : 'var(--color-red)' }}>{response.response.status}</span></span>
                            <span>Time: {response.timeMs} ms</span>
                        </div>
                    )}
                </div>
                <div style={{ flex: 1, padding: '10px', overflowY: 'auto', fontFamily: 'monospace', fontSize: '12px' }}>
                    {!loading && !response && <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No response yet...</div>}
                    {!loading && response && response.error && <div style={{ color: 'var(--color-red)' }}>Error: {response.error}</div>}
                    {!loading && response && response.response && (
                        <pre style={{ margin: 0 }}>
                            {(() => {
                                try {
                                    return JSON.stringify(response.response.json, null, 2);
                                } catch(e) {
                                    return response.response.text;
                                }
                            })()}
                        </pre>
                    )}
                </div>
            </div>
        </div>
    );
};
