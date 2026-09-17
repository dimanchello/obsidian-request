import * as React from 'react'

interface HighlightMatchProps {
    text: string
    query: string
}

export const HighlightMatch: React.FC<HighlightMatchProps> = ({ text, query }) => {
    if (!text) return <></>
    if (!query) return <>{text}</>
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const parts = text.split(new RegExp(`(${escapedQuery})`, 'gi'))
    return (
        <>
            {parts.map((part, i) =>
                part.toLowerCase() === query.toLowerCase() ? (
                    <mark
                        key={i}
                        style={{
                            backgroundColor: 'var(--text-highlight-bg, rgba(255, 234, 0, 0.5))',
                            color: 'inherit',
                            borderRadius: '2px',
                            padding: '0 2px'
                        }}
                    >
                        {part}
                    </mark>
                ) : (
                    <span key={i}>{part}</span>
                )
            )}
        </>
    )
}
