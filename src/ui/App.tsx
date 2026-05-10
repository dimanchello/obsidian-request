import * as React from 'react';
import { JSONPath } from 'jsonpath-plus';
import { CollectionData, RequestItem, Environment, ExtractionRule } from '../types';
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

    React.useEffect(() => {
        setCollectionData(data);
    }, [data]);

    const handleSave = (newData: CollectionData) => {
        setCollectionData(newData);
        onSave(newData);
    };

    const activeReq = collectionData.requests.find(r => r.id === activeReqId);

    return (
        <div style={{ display: 'flex', height: '100%', width: '100%', fontFamily: 'var(--font-interface)' }}>
            <div style={{ width: '250px', borderRight: '1px solid var(--background-modifier-border)', padding: '10px' }}>
                <select
                    style={{ width: '100%', marginBottom: '15px' }}
                    value={collectionData.activeEnvironmentId || ''}
                    onChange={(e) => handleSave({ ...collectionData, activeEnvironmentId: e.target.value })}
                >
                    {collectionData.environments.map((env: Environment) => (
                        <option key={env.id} value={env.id}>{env.name}</option>
                    ))}
                </select>
                <div>
                    {collectionData.requests.map((req: RequestItem) => (
                        <div key={req.id} onClick={() => setActiveReqId(req.id)} style={{ cursor: 'pointer', padding: '5px', background: activeReqId === req.id ? 'var(--background-modifier-active-hover)' : 'transparent' }}>
                            {req.method} {req.name}
                        </div>
                    ))}
                </div>
            </div>
            <div style={{ flex: 1, padding: '20px', display: 'flex', flexDirection: 'column' }}>
                {activeReq && (
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
                )}
            </div>
        </div>
    );
};

const RequestEditor = ({ request, collectionData, onChange, onExtract }: any) => {
    const [activeTab, setActiveTab] = React.useState('Body');
    const [response, setResponse] = React.useState<any>(null);

    const handleSend = async () => {
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
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                <select value={request.method} onChange={(e) => onChange({ ...request, method: e.target.value })}>
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                </select>
                <input style={{ flex: 1 }} value={request.url} onChange={(e) => onChange({ ...request, url: e.target.value })} />
                <button onClick={handleSend}>Send</button>
            </div>

            <div style={{ flex: 1, border: '1px solid var(--background-modifier-border)' }}>
                <div style={{ display: 'flex', gap: '10px', padding: '10px', borderBottom: '1px solid var(--background-modifier-border)' }}>
                    <button onClick={() => setActiveTab('Body')}>Body</button>
                    <button onClick={() => setActiveTab('Extract')}>Extract</button>
                </div>
                <div style={{ padding: '10px' }}>
                    {activeTab === 'Body' && (
                        <div>
                            <select value={request.bodyType} onChange={(e) => onChange({ ...request, bodyType: e.target.value })}>
                                <option value="none">None</option>
                                <option value="json">JSON</option>
                                <option value="form-data">Form Data</option>
                            </select>
                            {request.bodyType === 'json' && (
                                <textarea style={{ width: '100%', height: '100px' }} value={request.bodyRaw} onChange={(e) => onChange({ ...request, bodyRaw: e.target.value })} />
                            )}
                            {request.bodyType === 'form-data' && (
                                <div>
                                    {request.bodyFormData.map((fd: any, i: number) => (
                                        <div key={i} style={{ display: 'flex', gap: '5px', marginBottom: '5px' }}>
                                            <select value={fd.type} onChange={(e) => {
                                                const newFd = [...request.bodyFormData];
                                                newFd[i].type = e.target.value;
                                                onChange({ ...request, bodyFormData: newFd });
                                            }}>
                                                <option value="text">Text</option>
                                                <option value="file">File</option>
                                            </select>
                                            <input placeholder="Key" value={fd.key} onChange={(e) => {
                                                const newFd = [...request.bodyFormData];
                                                newFd[i].key = e.target.value;
                                                onChange({ ...request, bodyFormData: newFd });
                                            }} />
                                            {fd.type === 'file' ? (
                                                <input type="file" onChange={(e) => {
                                                    const file = e.target.files?.[0];
                                                    if (file) {
                                                        const newFd = [...request.bodyFormData];
                                                        newFd[i].value = (file as any).path;
                                                        onChange({ ...request, bodyFormData: newFd });
                                                    }
                                                }} />
                                            ) : (
                                                <input placeholder="Value" value={fd.value} onChange={(e) => {
                                                    const newFd = [...request.bodyFormData];
                                                    newFd[i].value = e.target.value;
                                                    onChange({ ...request, bodyFormData: newFd });
                                                }} />
                                            )}
                                        </div>
                                    ))}
                                    <button onClick={() => onChange({ ...request, bodyFormData: [...request.bodyFormData, { key: '', value: '', type: 'text', enabled: true }] })}>+ Add</button>
                                </div>
                            )}
                        </div>
                    )}
                    {activeTab === 'Extract' && (
                        <div>
                            {request.extractionRules.map((rule: ExtractionRule, i: number) => (
                                <div key={i} style={{ display: 'flex', gap: '5px' }}>
                                    <input placeholder="Var Name" value={rule.name} onChange={(e) => {
                                        const newRules = [...request.extractionRules];
                                        newRules[i].name = e.target.value;
                                        onChange({ ...request, extractionRules: newRules });
                                    }} />
                                    <input placeholder="JSONPath" value={rule.jsonPath} onChange={(e) => {
                                        const newRules = [...request.extractionRules];
                                        newRules[i].jsonPath = e.target.value;
                                        onChange({ ...request, extractionRules: newRules });
                                    }} />
                                </div>
                            ))}
                            <button onClick={() => onChange({ ...request, extractionRules: [...request.extractionRules, { id: Date.now().toString(), name: '', jsonPath: '$' }] })}>+ Add Rule</button>
                        </div>
                    )}
                </div>
            </div>

            <div style={{ height: '200px', marginTop: '20px', border: '1px solid var(--background-modifier-border)' }}>
                <pre style={{ padding: '10px' }}>{response && JSON.stringify(response.response?.json || response.response?.text || response.error, null, 2)}</pre>
            </div>
        </div>
    );
};
