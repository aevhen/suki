import { useState, useEffect, useCallback } from 'react';

export interface Tab {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  thumbnail?: string;
  loading: boolean;
  pinned: boolean;
}

export function useTabs() {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>('');

  useEffect(() => {
    const suki = (window as any).suki;
    if (!suki) return;

    const unsubUpdated = suki.onTabUpdated((data: { id: string; url: string; title: string; favicon?: string; loading?: boolean }) => {
      setTabs(prev => {
        const existing = prev.some(t => t.id === data.id);
        if (!existing) {
          return [...prev, { id: data.id, url: data.url, title: data.title || 'New Tab', favicon: data.favicon, loading: data.loading ?? false, pinned: false }];
        }
        return prev.map(t => t.id === data.id ? { ...t, ...data, loading: data.loading ?? false } : t);
      });
    });

    const unsubActivated = suki.onTabActivated((id: string) => {
      setActiveTabId(id);
    });

    const unsubThumbnail = suki.onTabThumbnail((data: { id: string; dataUrl: string }) => {
      setTabs(prev => prev.map(t => t.id === data.id ? { ...t, thumbnail: data.dataUrl } : t));
    });

    return () => {
      unsubUpdated?.();
      unsubActivated?.();
      unsubThumbnail?.();
    };
  }, []);

  const createTab = useCallback(async (url: string) => {
    const suki = (window as any).suki;
    const id = await suki.createTab(url);
    if (!id) return '';
    const newTab: Tab = { id, url, title: 'New Tab', loading: true, pinned: false };
    setTabs(prev => prev.some(t => t.id === id) ? prev : [...prev, newTab]);
    setActiveTabId(id);
    return id;
  }, []);

  const closeTab = useCallback(async (id: string) => {
    await (window as any).suki.closeTab(id);
    setTabs(prev => {
      const remaining = prev.filter(t => t.id !== id);
      setActiveTabId(current => {
        if (current !== id) return current;
        return remaining[remaining.length - 1]?.id ?? '';
      });
      return remaining;
    });
  }, []);

  const activateTab = useCallback(async (id: string) => {
    await (window as any).suki.activateTab(id);
    setActiveTabId(id);
  }, []);

  const navigate = useCallback(async (url: string) => {
    if (!activeTabId) return;
    await (window as any).suki.navigate(activeTabId, url);
  }, [activeTabId]);

  const reorderTabs = useCallback((fromIndex: number, toIndex: number) => {
    setTabs(prev => {
      if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= prev.length || toIndex >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  return { tabs, activeTabId, createTab, closeTab, activateTab, navigate, reorderTabs };
}
