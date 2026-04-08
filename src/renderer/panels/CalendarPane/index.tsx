import React, { useEffect, useMemo, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { DateSelectArg, EventClickArg, EventDropArg } from '@fullcalendar/core';

interface DbEvent {
  id: string;
  title: string;
  description: string;
  start_ts: number;
  end_ts: number;
  all_day: number;
  color?: string;
}

interface EventFormState {
  id?: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  color: string;
}

const COLORS = ['#7c6ee0', '#a394f0', '#3dd68c', '#f0b429', '#e05c5c', '#60a8e0'];

function toInputValue(date: Date) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

function fromInputValue(value: string) {
  return new Date(value);
}

function EventModal({
  state,
  onChange,
  onClose,
  onSave,
  onDelete,
}: {
  state: EventFormState;
  onChange: (patch: Partial<EventFormState>) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="animate-fade-in" style={{ position: 'fixed', inset: 0, background: 'rgba(10, 8, 18, 0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
      <div className="animate-scale-in" style={{ width: 420, background: '#110f1e', border: '1px solid #2d2850', borderRadius: 12, padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ color: '#e8e4ff', fontSize: 18 }}>{state.id ? 'Edit Event' : 'New Event'}</h3>
          <button onClick={onClose} style={{ color: '#5a5480', fontSize: 16 }}>×</button>
        </div>
        <div style={{ display: 'grid', gap: 12 }}>
          <input value={state.title} onChange={event => onChange({ title: event.target.value })} placeholder="Title" style={{ background: '#1a1730', border: '1px solid #2d2850', borderRadius: 6, padding: '8px 10px', color: '#e8e4ff' }} />
          <input type="datetime-local" value={state.start} onChange={event => onChange({ start: event.target.value })} style={{ background: '#1a1730', border: '1px solid #2d2850', borderRadius: 6, padding: '8px 10px', color: '#e8e4ff' }} />
          <input type="datetime-local" value={state.end} onChange={event => onChange({ end: event.target.value })} style={{ background: '#1a1730', border: '1px solid #2d2850', borderRadius: 6, padding: '8px 10px', color: '#e8e4ff' }} />
          <label style={{ color: '#9890c0', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={state.allDay} onChange={event => onChange({ allDay: event.target.checked })} />
            All day
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            {COLORS.map(color => (
              <button key={color} onClick={() => onChange({ color })} style={{ width: 24, height: 24, borderRadius: '50%', background: color, border: state.color === color ? '2px solid #e8e4ff' : '2px solid transparent' }} />
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18 }}>
          {onDelete ? <button onClick={onDelete} style={{ background: '#e05c5c', color: '#fff', borderRadius: 6, padding: '8px 12px', fontSize: 12 }}>Delete</button> : <span />}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{ color: '#9890c0', border: '1px solid #2d2850', borderRadius: 6, padding: '8px 12px', fontSize: 12 }}>Cancel</button>
            <button onClick={onSave} style={{ background: '#7c6ee0', color: '#fff', borderRadius: 6, padding: '8px 12px', fontSize: 12 }}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CalendarPane() {
  const [events, setEvents] = useState<DbEvent[]>([]);
  const [range, setRange] = useState<{ start: number; end: number } | null>(null);
  const [modal, setModal] = useState<EventFormState | null>(null);

  const loadEvents = async (startTs: number, endTs: number) => {
    const rows = await (window as any).suki.getEvents(startTs, endTs) as DbEvent[];
    setEvents(rows);
    setRange({ start: startTs, end: endTs });
  };

  useEffect(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const end = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59, 999).getTime();
    void loadEvents(start, end);
  }, []);

  const calendarEvents = useMemo(() => events.map(event => ({
    id: event.id,
    title: event.title,
    start: new Date(event.start_ts),
    end: new Date(event.end_ts),
    allDay: event.all_day === 1,
    backgroundColor: event.color ?? '#7c6ee0',
  })), [events]);

  const handleDateSelect = (selection: DateSelectArg) => {
    setModal({
      title: '',
      start: toInputValue(selection.start),
      end: toInputValue(selection.end ?? selection.start),
      allDay: selection.allDay,
      color: '#7c6ee0',
    });
  };

  const handleEventClick = (click: EventClickArg) => {
    setModal({
      id: click.event.id,
      title: click.event.title,
      start: toInputValue(click.event.start ?? new Date()),
      end: toInputValue(click.event.end ?? click.event.start ?? new Date()),
      allDay: click.event.allDay,
      color: click.event.backgroundColor || '#7c6ee0',
    });
  };

  const handleSave = async () => {
    if (!modal || !modal.title.trim()) return;
    const payload = {
      title: modal.title.trim(),
      start_ts: fromInputValue(modal.start).getTime(),
      end_ts: fromInputValue(modal.end).getTime(),
      all_day: modal.allDay ? 1 : 0,
      color: modal.color,
    };
    if (modal.id) await (window as any).suki.updateEvent(modal.id, payload);
    else await (window as any).suki.createEvent(payload);
    setModal(null);
    if (range) await loadEvents(range.start, range.end);
  };

  const handleDelete = async () => {
    if (!modal?.id) return;
    await (window as any).suki.deleteEvent(modal.id);
    setModal(null);
    if (range) await loadEvents(range.start, range.end);
  };

  const handleEventDrop = async (change: EventDropArg | { event: EventDropArg['event'] }) => {
    await (window as any).suki.updateEvent(change.event.id, {
      start_ts: change.event.start?.getTime(),
      end_ts: change.event.end?.getTime() ?? change.event.start?.getTime(),
    });
    if (range) await loadEvents(range.start, range.end);
  };

  return (
    <div className="animate-fade-in-up" style={{ height: '100%', background: '#0a0812', position: 'relative' }}>
      <style>{`
        .fc { background: #0a0812; color: #e8e4ff; height: 100%; }
        .fc-toolbar-title { color: #e8e4ff; }
        .fc-button { background: #110f1e !important; border: 1px solid #2d2850 !important; color: #9890c0 !important; box-shadow: none !important; }
        .fc-button:hover { background: #1a1730 !important; color: #e8e4ff !important; }
        .fc-button-primary:not(:disabled).fc-button-active { background: #7c6ee0 !important; border-color: #7c6ee0 !important; color: white !important; }
        .fc-daygrid-day:hover, .fc-timegrid-col:hover { background: #110f1e; }
        .fc-day-today { background: #110f1e !important; }
        .fc-daygrid-day-number, .fc-timegrid-axis-cushion { color: #9890c0; }
        .fc-col-header-cell-cushion { color: #5a5480; }
        .fc-theme-standard td, .fc-theme-standard th, .fc-theme-standard .fc-scrollgrid { border-color: #2d2850; }
        .fc-event { border: none !important; border-radius: 4px !important; }
      `}</style>

      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' }}
        editable
        selectable
        selectMirror
        dayMaxEvents
        height="100%"
        events={calendarEvents}
        select={handleDateSelect}
        eventClick={handleEventClick}
        eventDrop={handleEventDrop}
        eventResize={handleEventDrop}
        datesSet={arg => {
          void loadEvents(arg.start.getTime(), arg.end.getTime());
        }}
      />

      {modal && (
        <EventModal
          state={modal}
          onChange={patch => setModal(prev => prev ? { ...prev, ...patch } : prev)}
          onClose={() => setModal(null)}
          onSave={() => void handleSave()}
          onDelete={modal.id ? () => void handleDelete() : undefined}
        />
      )}
    </div>
  );
}
