import React from 'react';

export default function NavBar() {
  return (
    <div style={{ height: 44, flex: 1, background: '#0a0812', borderBottom: '1px solid #2d2850', display: 'flex', alignItems: 'center', padding: '0 12px' }}>
      <input
        placeholder="Search or enter URL"
        style={{ width: '100%', height: 28, background: '#110f1e', color: '#e8e4ff', border: '1px solid #2d2850', borderRadius: 6, padding: '0 10px', outline: 'none', fontSize: 13 }}
      />
    </div>
  );
}
