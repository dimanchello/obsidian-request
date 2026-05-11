import * as React from 'react';
import { CollectionData, RequestItem } from '../types';

export const PreRequestsTab = ({ request, collectionData, onChange }: any) => {

    const availableRequests = collectionData.requests.filter((r: RequestItem) => r.id !== request.id);
    const dependencies: string[] = request.dependencies || [];

    const addDependency = (id: string) => {
        if (!dependencies.includes(id)) {
            onChange({ ...request, dependencies: [...dependencies, id] });
        }
    };

    const removeDependency = (index: number) => {
        const newDeps = [...dependencies];
        newDeps.splice(index, 1);
        onChange({ ...request, dependencies: newDeps });
    };

    const moveDependency = (index: number, dir: number) => {
        if (index + dir < 0 || index + dir >= dependencies.length) return;
        const newDeps = [...dependencies];
        const temp = newDeps[index];
        newDeps[index] = newDeps[index + dir];
        newDeps[index + dir] = temp;
        onChange({ ...request, dependencies: newDeps });
    };

    return (
        <div style={{ padding: '10px 0' }}>
            <p style={{ fontSize: '0.9em', color: 'var(--text-muted)', marginBottom: '15px' }}>
                Select other requests to run sequentially before this one. Variables extracted from their responses will be available here.
            </p>

            <div style={{ marginBottom: '15px' }}>
                <select
                    className="postman-kv-input"
                    onChange={(e) => {
                        if (e.target.value) addDependency(e.target.value);
                        e.target.value = "";
                    }}
                    value=""
                >
                    <option value="" disabled>+ Add Dependency</option>
                    {availableRequests.map((r: RequestItem) => (
                        <option key={r.id} value={r.id}>{r.method} {r.name}</option>
                    ))}
                </select>
            </div>

            {dependencies.length > 0 ? (
                <div style={{ border: '1px solid var(--background-modifier-border)', borderRadius: '4px', overflow: 'hidden' }}>
                    {dependencies.map((depId, i) => {
                        const depReq = collectionData.requests.find((r: RequestItem) => r.id === depId);
                        return (
                            <div key={depId + i} className="postman-kv-row" style={{ padding: '10px', margin: 0, borderBottom: i < dependencies.length - 1 ? '1px solid var(--background-modifier-border)' : 'none', background: 'var(--background-secondary)' }}>
                                <div style={{ display: 'flex', gap: '5px', flexDirection: 'column', marginRight: '10px' }}>
                                    <button className="btn-ghost" style={{ padding: '0 4px' }} disabled={i === 0} onClick={() => moveDependency(i, -1)}>▲</button>
                                    <button className="btn-ghost" style={{ padding: '0 4px' }} disabled={i === dependencies.length - 1} onClick={() => moveDependency(i, 1)}>▼</button>
                                </div>
                                <span style={{ flex: 1, fontWeight: 'bold' }}>{depReq ? depReq.name : 'Unknown Request'}</span>
                                <button className="btn-ghost" onClick={() => removeDependency(i)}>×</button>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No dependencies selected.</div>
            )}
        </div>
    );
};
