import React from 'react';

export default function NavBar() {
  return (
    <div style={{ height: 44, flex: 1, background: '#0d0d0f', borderBottom: '1px solid #2a2a33', display: 'flex', alignItems: 'center', padding: '0 12px' }}>
      <input
        placeholder="Search or enter URL"
        style={{ width: '100%', height: 28, background: '#141418', color: '#e8e8ec', border: '1px solid #2a2a33', borderRadius: 6, padding: '0 10px', outline: 'none', fontSize: 13 }}
      />
    </div>
  );
}
