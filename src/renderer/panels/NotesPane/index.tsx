import React, { useEffect, useMemo, useRef, useState } from 'react';
import MDEditor from '@uiw/react-md-editor';

interface NoteRecord {
  id: string;
  title: string;
  body_md: string;
  tags: string;
  created_at: number;
  updated_at: number;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function parseTags(tags: string): string[] {
  return tags.split(',').map(tag => tag.trim()).filter(Boolean);
}

function toTagString(tags: string[]): string {
  return tags.join(', ');
}

function renderLinkedPreview(text: string, notes: NoteRecord[], onJump: (id: string) => void) {
  const parts = text.split(/(\[\[[^\]]+\]\])/g).filter(Boolean);
  return parts.map((part, index) => {
    const match = part.match(/^\[\[([^\]]+)\]\]$/);
    if (!match) {
      return <span key={`${part}-${index}`}>{part}</span>;
    }

    const target = notes.find(note => note.title.toLowerCase() === match[1].trim().toLowerCase());
    return (
      <button
        key={`${part}-${index}`}
        onClick={event => {
          event.stopPropagation();
          if (target) onJump(target.id);
        }}
        style={{ color: '#7c6ee0', fontSize: 11, textDecoration: 'underline' }}
      >
        {match[1]}
      </button>
    );
  });
}

export default function NotesPane() {
  const [notes, setNotes] = useState<NoteRecord[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showTagInput, setShowTagInput] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [saved, setSaved] = useState(false);
  const saveTimer = useRef<number | null>(null);
  const searchTimer = useRef<number | null>(null);

  const activeNote = useMemo(
    () => notes.find(note => note.id === activeNoteId) ?? null,
    [activeNoteId, notes],
  );

  const loadNotes = async (query = '') => {
    const rows = query
      ? await (window as any).suki.searchNotes(query)
      : await (window as any).suki.getNotes();
    setNotes(rows);
    setActiveNoteId(current => current && rows.some((note: NoteRecord) => note.id === current) ? current : rows[0]?.id ?? null);
  };

  useEffect(() => {
    void loadNotes();
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      if (searchTimer.current) window.clearTimeout(searchTimer.current);
    };
  }, []);

  useEffect(() => {
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => {
      void loadNotes(search.trim());
    }, 200);
  }, [search]);

  const scheduleSave = (note: NoteRecord) => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      await (window as any).suki.updateNote(note.id, {
        title: note.title,
        body_md: note.body_md,
        tags: note.tags,
        updated_at: Date.now(),
      });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1500);
      await loadNotes(search.trim());
      setActiveNoteId(note.id);
    }, 1000);
  };

  const updateActiveNote = (patch: Partial<NoteRecord>) => {
    if (!activeNote) return;
    const updated = { ...activeNote, ...patch, updated_at: Date.now() };
    setNotes(prev => prev.map(note => note.id === updated.id ? updated : note));
    scheduleSave(updated);
  };

  const createNote = async () => {
    const id = await (window as any).suki.createNote({
      title: 'Untitled',
      body_md: '',
      tags: '',
    });
    const created = await (window as any).suki.getNote(id) as NoteRecord;
    setNotes(prev => [created, ...prev]);
    setActiveNoteId(id);
  };

  const deleteNote = async (id: string) => {
    await (window as any).suki.deleteNote(id);
    setNotes(prev => prev.filter(note => note.id !== id));
    setActiveNoteId(current => current === id ? null : current);
  };

  const jumpToNote = (id: string) => setActiveNoteId(id);

  const activeTags = parseTags(activeNote?.tags ?? '');

  return (
    <div className="animate-fade-in-up" style={{ height: '100%', display: 'flex', background: '#0a0812' }}>
      <div style={{ width: 260, borderRight: '1px solid #2d2850', background: '#0a0812', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: 12, borderBottom: '1px solid #2d2850', display: 'flex', gap: 8 }}>
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search notes..."
            style={{
              flex: 1,
              background: '#110f1e',
              border: '1px solid #2d2850',
              borderRadius: 6,
              color: '#e8e4ff',
              padding: '6px 10px',
              fontSize: 12,
            }}
          />
          <button
            onClick={() => void createNote()}
            style={{
              background: '#7c6ee0',
              color: '#ffffff',
              borderRadius: 6,
              padding: '4px 12px',
              fontSize: 12,
            }}
            onMouseEnter={event => { event.currentTarget.style.background = '#a394f0'; }}
            onMouseLeave={event => { event.currentTarget.style.background = '#7c6ee0'; }}
          >
            New Note
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {notes.map(note => {
            const isActive = note.id === activeNoteId;
            return (
              <button
                key={note.id}
                className="animate-fade-in-left"
                onClick={() => setActiveNoteId(note.id)}
                style={{
                  height: 64,
                  width: '100%',
                  padding: '10px 12px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  background: isActive ? '#1a1730' : 'transparent',
                  borderLeft: `2px solid ${isActive ? '#7c6ee0' : 'transparent'}`,
                  transition: 'all 0.15s ease',
                  textAlign: 'left',
                }}
                onMouseEnter={event => {
                  if (!isActive) event.currentTarget.style.background = '#110f1e';
                }}
                onMouseLeave={event => {
                  if (!isActive) event.currentTarget.style.background = 'transparent';
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, color: '#e8e4ff', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {note.title || 'Untitled'}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: '#5a5480',
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}
                  >
                    {renderLinkedPreview(note.body_md || 'Empty note', notes, jumpToNote)}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, marginLeft: 8 }}>
                  <span style={{ fontSize: 10, color: '#5a5480' }}>{formatDate(note.updated_at)}</span>
                  <span
                    onClick={event => {
                      event.stopPropagation();
                      void deleteNote(note.id);
                    }}
                    style={{ color: '#5a5480', fontSize: 14 }}
                  >
                    ×
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
        {saved && (
          <div style={{ position: 'absolute', top: 12, right: 16, color: '#3dd68c', fontSize: 12, zIndex: 5 }}>
            Saved
          </div>
        )}

        {activeNote ? (
          <>
            <input
              value={activeNote.title}
              onChange={event => updateActiveNote({ title: event.target.value })}
              placeholder="Untitled"
              style={{
                fontSize: 20,
                fontWeight: 600,
                color: '#e8e4ff',
                background: 'transparent',
                border: 'none',
                borderBottom: '1px solid #2d2850',
                padding: '16px 20px 12px',
                width: '100%',
              }}
            />
            <div style={{ padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', borderBottom: '1px solid #2d2850' }}>
              {activeTags.map(tag => (
                <span
                  key={tag}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#1a1730', color: '#7c6ee0', borderRadius: 12, padding: '2px 8px', fontSize: 11 }}
                >
                  {tag}
                  <button onClick={() => updateActiveNote({ tags: toTagString(activeTags.filter(item => item !== tag)) })}>×</button>
                </span>
              ))}
              {showTagInput ? (
                <input
                  autoFocus
                  value={newTag}
                  onChange={event => setNewTag(event.target.value)}
                  onBlur={() => {
                    setShowTagInput(false);
                    setNewTag('');
                  }}
                  onKeyDown={event => {
                    if (event.key === 'Enter' && newTag.trim()) {
                      updateActiveNote({ tags: toTagString([...activeTags, newTag.trim()]) });
                      setNewTag('');
                      setShowTagInput(false);
                    }
                    if (event.key === 'Escape') {
                      setNewTag('');
                      setShowTagInput(false);
                    }
                  }}
                  style={{ background: '#110f1e', border: '1px solid #2d2850', borderRadius: 12, padding: '4px 8px', fontSize: 11 }}
                />
              ) : (
                <button onClick={() => setShowTagInput(true)} style={{ color: '#5a5480', fontSize: 11 }}>
                  + Add tag
                </button>
              )}
            </div>
            <div data-color-mode="dark" style={{ flex: 1, minHeight: 0, overflow: 'hidden', background: '#0a0812' }}>
              <MDEditor
                value={activeNote.body_md}
                onChange={value => updateActiveNote({ body_md: value ?? '' })}
                height={undefined}
                preview="edit"
                visibleDragbar={false}
                textareaProps={{ placeholder: 'Write in markdown...' }}
                style={{ height: '100%', backgroundColor: '#0a0812', color: '#e8e4ff' }}
              />
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5a5480' }}>
            Select a note or create a new one
          </div>
        )}
      </div>
    </div>
  );
}
