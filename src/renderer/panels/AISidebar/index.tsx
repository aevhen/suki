import React, { useState } from 'react';

export default function AISidebar() {
  const [open, setOpen] = useState(false);
  return (
    <div
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      style={{
        position: 'absolute',
        top: 44,
        right: 0,
        bottom: 40,
        width: 360,
        transform: open ? 'translateX(0)' : 'translateX(340px)',
        transition: 'transform 160ms ease',
        background: '#141418',
        borderLeft: '1px solid #2a2a33',
        color: '#8a8a96',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 14,
        zIndex: 20,
      }}
    >
      AI Sidebar
    </div>
  );
}
