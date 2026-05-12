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

    const [searchQuery, setSearchQuery] = React.useState('');

    return (
        <div style={{ padding: '10px 0' }}>
            <p style={{ fontSize: '0.85em', color: 'var(--text-muted)', marginBottom: '15px' }}>
                Select other requests to run sequentially before this one. Variables extracted from their responses will be available here.
            </p>

            <div style={{ marginBottom: '15px', display: 'flex', gap: '10px' }}>
                <input
                    className="postman-kv-input"
                    type="text"
                    placeholder="Search request to add..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    style={{ flex: 1 }}
                    list="prereq-requests-datalist"
                    onKeyDown={(e: any) => {
                        if (e.key === 'Enter') {
                            // Find match by exact name
                            const match = availableRequests.find((r: RequestItem) => r.name === e.target.value);
                            if (match) {
                                addDependency(match.id);
                                setSearchQuery('');
                            }
                        }
                    }}
                />
                <datalist id="prereq-requests-datalist">
                    {availableRequests.map((r: RequestItem) => (
                        <option key={r.id} value={r.name}>{r.method} {r.url}</option>
                    ))}
                </datalist>
                <button
                    className="btn-ghost"
                    style={{ border: '1px solid var(--background-modifier-border) !important' }}
                    onClick={() => {
                        const match = availableRequests.find((r: RequestItem) => r.name === searchQuery);
                        if (match) {
                            addDependency(match.id);
                            setSearchQuery('');
                        }
                    }}
                >
                    + Add
                </button>
            </div>

            {dependencies.length > 0 ? (
                <div style={{ border: '1px solid var(--background-modifier-border)', borderRadius: '4px', overflow: 'hidden' }}>
                    {dependencies.map((depId, i) => {
                        const depReq = collectionData.requests.find((r: RequestItem) => r.id === depId);
                        return (
                            <div key={depId + i} className="postman-kv-row" style={{ padding: '4px 8px', margin: 0, borderBottom: i < dependencies.length - 1 ? '1px solid var(--background-modifier-border)' : 'none', background: 'var(--background-secondary)', fontSize: '0.9em' }}>
                                <div style={{ display: 'flex', gap: '2px', marginRight: '10px' }}>
                                    <button className="btn-ghost" style={{ padding: '2px 4px', fontSize: '10px' }} disabled={i === 0} onClick={() => moveDependency(i, -1)}>▲</button>
                                    <button className="btn-ghost" style={{ padding: '2px 4px', fontSize: '10px' }} disabled={i === dependencies.length - 1} onClick={() => moveDependency(i, 1)}>▼</button>
                                </div>
                                <span style={{ flex: 1, fontWeight: '600' }}>
                                    <span style={{ fontSize: '9px', padding: '1px 4px', marginRight: '6px', background: 'var(--background-modifier-border)', borderRadius: '3px' }}>{depReq?.method || 'N/A'}</span>
                                    {depReq ? depReq.name : 'Unknown Request'}
                                </span>
                                <button className="btn-ghost" style={{ padding: '2px 6px' }} onClick={() => removeDependency(i)}>✕</button>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.9em' }}>No dependencies selected.</div>
            )}
        </div>
    );
};
