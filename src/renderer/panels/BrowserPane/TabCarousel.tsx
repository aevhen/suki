import React, { useRef, useState } from 'react';
import { useTabs } from '../../hooks/useTabs';

const TAB_HEIGHT = 80;

export default function TabCarousel() {
  const { tabs, activeTabId, createTab, closeTab, activateTab, reorderTabs } = useTabs();
  const [scrollY, setScrollY] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragStartY, setDragStartY] = useState(0);
  const [closingIds, setClosingIds] = useState<Set<string>>(new Set());
  const listRef = useRef<HTMLDivElement>(null);

  const maxScroll = Math.max(0, tabs.length * TAB_HEIGHT - (window.innerHeight - 108));

  const handleWheel = (e: React.WheelEvent) => {
    setScrollY(prev => Math.min(maxScroll, Math.max(0, prev + e.deltaY * 0.6)));
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragIndex === null) return;
    const delta = e.clientY - dragStartY;
    if (Math.abs(delta) <= 40) return;
    const direction = delta > 0 ? 1 : -1;
    const nextIndex = dragIndex + direction;
    if (nextIndex < 0 || nextIndex >= tabs.length) return;
    reorderTabs(dragIndex, nextIndex);
    setDragIndex(nextIndex);
    setDragStartY(e.clientY);
  };

  const handleClose = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setClosingIds(prev => new Set(prev).add(id));
    setTimeout(() => {
      closeTab(id);
      setClosingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 150);
  };

  return (
    <div
      style={{
        width: collapsed ? 48 : 72,
        transition: 'width 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        height: '100%',
        background: '#0a0812',
        borderRight: '1px solid #2d2850',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflow: 'hidden',
        position: 'relative',
        userSelect: 'none',
      }}
      onWheel={handleWheel}
      onMouseMove={handleMouseMove}
      onMouseUp={() => setDragIndex(null)}
      onMouseLeave={() => setDragIndex(null)}
    >
      <div
        onClick={() => setCollapsed(c => !c)}
        style={{
          height: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#5a5480',
          cursor: 'pointer',
          fontSize: 12,
          flexShrink: 0,
          transition: 'color 0.15s ease',
        }}
        onMouseEnter={e => (e.currentTarget.style.color = '#7c6ee0')}
        onMouseLeave={e => (e.currentTarget.style.color = '#5a5480')}
      >
        {collapsed ? '\u203a' : '\u2039'}
      </div>

      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <div
          ref={listRef}
          style={{
            transform: `translateY(-${scrollY}px)`,
            transition: 'transform 0.1s ease',
          }}
        >
          {tabs.map((tab, index) => {
            const isActive = activeTabId === tab.id;
            const isHovered = hoveredId === tab.id;
            const isDragging = dragIndex === index;
            const isClosing = closingIds.has(tab.id);

            return (
              <div
                key={tab.id}
                className={isClosing ? 'animate-fade-out' : 'animate-fade-in-left'}
                onClick={() => activateTab(tab.id)}
                onMouseEnter={() => setHoveredId(tab.id)}
                onMouseLeave={() => setHoveredId(null)}
                onMouseDown={e => {
                  setDragStartY(e.clientY);
                  setDragIndex(index);
                }}
                style={{
                  height: TAB_HEIGHT,
                  width: '100%',
                  position: 'relative',
                  background: isActive ? '#1a1730' : isHovered ? '#110f1e' : 'transparent',
                  borderLeft: `2px solid ${isActive ? '#7c6ee0' : 'transparent'}`,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  padding: '4px 0',
                  transition: 'all 0.15s ease',
                  opacity: isDragging ? 0.6 : 1,
                  transform: isDragging ? 'scale(1.02)' : 'scale(1)',
                  zIndex: isDragging ? 10 : 1,
                }}
              >
                {tab.pinned && (
                  <div style={{ position: 'absolute', top: 4, left: 4, width: 6, height: 6, borderRadius: '50%', background: '#7c6ee0' }} />
                )}

                {collapsed ? (
                  <div style={{ width: 28, height: 28, borderRadius: 4, background: '#110f1e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {tab.favicon
                      ? <img src={tab.favicon} alt="" style={{ width: 16, height: 16 }} />
                      : <div style={{ width: 16, height: 16, borderRadius: 2, background: '#2d2850' }} />}
                  </div>
                ) : (
                  tab.thumbnail
                    ? <img src={tab.thumbnail} alt="" style={{ width: 56, height: 36, borderRadius: 4, objectFit: 'cover', background: '#110f1e' }} />
                    : <div style={{ width: 56, height: 36, borderRadius: 4, background: '#110f1e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {tab.favicon
                          ? <img src={tab.favicon} alt="" style={{ width: 16, height: 16 }} />
                          : <div style={{ width: 16, height: 16, borderRadius: 2, background: '#2d2850' }} />}
                      </div>
                )}

                {!collapsed && (
                  <div style={{
                    fontSize: 10,
                    color: isActive || isHovered ? '#e8e4ff' : '#9890c0',
                    maxWidth: 60,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    textAlign: 'center',
                    padding: '0 4px',
                    transition: 'color 0.15s ease',
                  }}>
                    {tab.title || 'New Tab'}
                  </div>
                )}

                {tab.loading && (
                  <div style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    height: 2,
                    background: '#7c6ee0',
                    animation: 'loadingBar 1.5s ease-in-out infinite',
                  }} />
                )}

                {isHovered && (
                  <div
                    onClick={e => handleClose(e, tab.id)}
                    style={{
                      position: 'absolute',
                      top: 4,
                      right: 4,
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      background: '#2d2850',
                      color: '#9890c0',
                      fontSize: 10,
                      lineHeight: '14px',
                      textAlign: 'center',
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#e05c5c'; e.currentTarget.style.color = 'white'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#2d2850'; e.currentTarget.style.color = '#9890c0'; }}
                  >
                    {'\u00d7'}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div
        onClick={() => createTab('https://google.com')}
        style={{
          height: 36,
          width: collapsed ? 48 : 72,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#5a5480',
          fontSize: 18,
          cursor: 'pointer',
          flexShrink: 0,
          transition: 'all 0.15s ease',
          borderTop: '1px solid #2d2850',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = '#7c6ee0'; e.currentTarget.style.background = '#110f1e'; }}
        onMouseLeave={e => { e.currentTarget.style.color = '#5a5480'; e.currentTarget.style.background = 'transparent'; }}
      >
        +
      </div>
    </div>
  );
}
