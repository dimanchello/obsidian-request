import * as React from 'react'
import { CollectionData, Environment, Variable } from '../../types'

interface EnvironmentModalProps {
    show: boolean
    collectionData: CollectionData
    onSave: (data: CollectionData) => void
    onClose: () => void
}

export const EnvironmentModal: React.FC<EnvironmentModalProps> = ({ show, collectionData, onSave, onClose }) => {
    const [activeEnvId, setActiveEnvId] = React.useState(collectionData.environments[0]?.id)

    if (!show) return null

    const activeEnv = collectionData.environments.find((e: Environment) => e.id === activeEnvId)

    const handleEnvChange = (updatedEnv: Environment) => {
        const newEnvs = collectionData.environments.map((e: Environment) => (e.id === updatedEnv.id ? updatedEnv : e))
        onSave({ ...collectionData, environments: newEnvs })
    }

    const addEnv = () => {
        const newEnv: Environment = { id: Date.now().toString(), name: 'New Environment', variables: [] }
        onSave({ ...collectionData, environments: [...collectionData.environments, newEnv] })
        setActiveEnvId(newEnv.id)
    }

    return (
        <div className="obsidian-request-modal-overlay" onClick={onClose}>
            <div className="obsidian-request-modal" onClick={(e) => e.stopPropagation()}>
                <div
                    style={{
                        padding: '15px 20px',
                        borderBottom: '1px solid var(--background-modifier-border)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: 'var(--background-secondary)'
                    }}
                >
                    <h3 style={{ margin: 0 }}>Manage Environments</h3>
                    <button className="btn-ghost" onClick={onClose}>
                        ✕
                    </button>
                </div>
                <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                    <div
                        className="env-sidebar"
                        style={{
                            width: '220px',
                            borderRight: '1px solid var(--background-modifier-border)',
                            display: 'flex',
                            flexDirection: 'column',
                            background: 'var(--background-secondary)'
                        }}
                    >
                        <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
                            {collectionData.environments.map((env: Environment) => (
                                <div
                                    key={env.id}
                                    onClick={() => setActiveEnvId(env.id)}
                                    className={`obsidian-request-request-item ${activeEnvId === env.id ? 'active' : ''}`}
                                    style={{ marginBottom: '2px' }}
                                >
                                    <span style={{ fontSize: '14px' }}>{env.name}</span>
                                    <button
                                        className="btn-ghost"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            const newEnvs = collectionData.environments.filter(
                                                (e2: Environment) => e2.id !== env.id
                                            )
                                            onSave({
                                                ...collectionData,
                                                environments: newEnvs,
                                                activeEnvironmentId:
                                                    collectionData.activeEnvironmentId === env.id
                                                        ? null
                                                        : collectionData.activeEnvironmentId
                                            })
                                        }}
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                        </div>
                        <div style={{ padding: '10px', borderTop: '1px solid var(--background-modifier-border)' }}>
                            <button
                                style={{
                                    width: '100%',
                                    background: 'transparent',
                                    border: '1px dashed var(--background-modifier-border)',
                                    padding: '6px',
                                    borderRadius: '4px',
                                    color: 'var(--text-muted)',
                                    cursor: 'pointer'
                                }}
                                onClick={addEnv}
                            >
                                + Add Environment
                            </button>
                        </div>
                    </div>
                    <div style={{ flex: 1, padding: '20px', overflowY: 'auto' }}>
                        {activeEnv ? (
                            <div>
                                <div style={{ marginBottom: '20px' }}>
                                    <label
                                        style={{
                                            display: 'block',
                                            fontSize: '11px',
                                            color: 'var(--text-muted)',
                                            textTransform: 'uppercase',
                                            marginBottom: '5px'
                                        }}
                                    >
                                        Environment Name
                                    </label>
                                    <input
                                        style={{
                                            fontSize: '16px',
                                            fontWeight: 'bold',
                                            width: '100%',
                                            background: 'var(--background-primary)',
                                            border: '1px solid var(--background-modifier-border)',
                                            padding: '8px',
                                            borderRadius: '4px'
                                        }}
                                        value={activeEnv.name}
                                        onChange={(e) => handleEnvChange({ ...activeEnv, name: e.target.value })}
                                    />
                                </div>

                                <label
                                    style={{
                                        display: 'block',
                                        fontSize: '11px',
                                        color: 'var(--text-muted)',
                                        textTransform: 'uppercase',
                                        marginBottom: '10px'
                                    }}
                                >
                                    Variables
                                </label>
                                {activeEnv.variables.map((v: Variable, i: number) => (
                                    <div key={i} className="obsidian-request-kv-row">
                                        <input
                                            type="checkbox"
                                            checked={v.enabled}
                                            onChange={(e) => {
                                                const newVars = activeEnv.variables.map((item, idx) =>
                                                    idx === i ? { ...item, enabled: e.target.checked } : item
                                                )
                                                handleEnvChange({ ...activeEnv, variables: newVars })
                                            }}
                                        />
                                        <input
                                            className="obsidian-request-kv-input"
                                            style={{ flex: 1 }}
                                            placeholder="Variable key"
                                            value={v.key}
                                            onChange={(e) => {
                                                const newVars = activeEnv.variables.map((item, idx) =>
                                                    idx === i ? { ...item, key: e.target.value } : item
                                                )
                                                handleEnvChange({ ...activeEnv, variables: newVars })
                                            }}
                                        />
                                        <input
                                            className="obsidian-request-kv-input"
                                            style={{ flex: 2 }}
                                            placeholder="Initial value"
                                            value={v.value}
                                            onChange={(e) => {
                                                const newVars = activeEnv.variables.map((item, idx) =>
                                                    idx === i ? { ...item, value: e.target.value } : item
                                                )
                                                handleEnvChange({ ...activeEnv, variables: newVars })
                                            }}
                                        />
                                        <button
                                            className="btn-ghost"
                                            onClick={() => {
                                                const newVars = [...activeEnv.variables]
                                                newVars.splice(i, 1)
                                                handleEnvChange({ ...activeEnv, variables: newVars })
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
                                        handleEnvChange({
                                            ...activeEnv,
                                            variables: [...activeEnv.variables, { key: '', value: '', enabled: true }]
                                        })
                                    }
                                >
                                    + Add Variable
                                </button>
                            </div>
                        ) : (
                            <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '50px' }}>
                                Select an environment to edit
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
