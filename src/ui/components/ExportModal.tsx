import * as React from 'react'

interface ExportModalProps {
    show: boolean
    onClose: () => void
    onExport: (format: 'external' | 'native') => void
}

export const ExportModal: React.FC<ExportModalProps> = ({ show, onClose, onExport }) => {
    if (!show) return null

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000
            }}
            onClick={onClose}
        >
            <div
                className="obsidian-request-modal"
                style={{
                    backgroundColor: 'var(--background-primary)',
                    padding: '24px',
                    borderRadius: '8px',
                    width: '400px',
                    border: '1px solid var(--background-modifier-border)'
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <h3 style={{ marginTop: 0, marginBottom: '16px', color: 'var(--text-normal)' }}>Export Collection</h3>

                <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '20px' }}>
                    Choose export format for your collection:
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <button
                        className="btn-primary"
                        onClick={() => onExport('external')}
                        style={{ padding: '10px 16px', textTransform: 'none' }}
                    >
                        Export as Postman Collection (v2.1)
                    </button>
                    <button
                        className="btn-secondary"
                        onClick={() => onExport('native')}
                        style={{ padding: '10px 16px', textTransform: 'none' }}
                    >
                        Export as Native JSON Format
                    </button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
                    <button className="btn-secondary" onClick={onClose}>
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    )
}
