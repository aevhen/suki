import React, { useEffect, useMemo, useState } from 'react';
import { closestCorners, DndContext, DragEndEvent, DragOverlay, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface Board {
  id: string;
  name: string;
  position: number;
}

interface Column {
  id: string;
  board_id: string;
  name: string;
  position: number;
  color: string;
}

interface Task {
  id: string;
  column_id: string;
  title: string;
  description: string;
  due_date?: number | null;
  priority: number;
  tags: string;
  position: number;
  created_at: number;
}

const DEFAULT_COLUMNS = [
  { name: 'Backlog', color: '#5a5480' },
  { name: 'In Progress', color: '#7c6ee0' },
  { name: 'Review', color: '#3dd68c' },
  { name: 'Done', color: '#a394f0' },
];

function priorityStyle(priority: number) {
  if (priority === 0) return { background: 'rgba(224,92,92,0.15)', color: '#e05c5c' };
  if (priority === 1) return { background: 'rgba(240,180,41,0.15)', color: '#f0b429' };
  return { background: 'rgba(124,110,224,0.15)', color: '#7c6ee0' };
}

function TaskCard({ task, dragging = false, onDelete }: { task: Task; dragging?: boolean; onDelete?: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: dragging || isDragging ? 0.9 : 1,
  };
  const priority = priorityStyle(task.priority);

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="animate-fade-in-up"
      style={{
        ...style,
        background: '#110f1e',
        border: '1px solid #2d2850',
        borderRadius: 8,
        padding: '10px 12px',
        margin: '0 8px 8px',
        transition: 'all 0.15s ease',
        position: 'relative',
        cursor: 'grab',
      }}
    >
      {onDelete && (
        <button onClick={() => onDelete(task.id)} style={{ position: 'absolute', top: 8, right: 8, color: '#5a5480', fontSize: 14 }}>
          ×
        </button>
      )}
      <div style={{ fontSize: 13, color: '#e8e4ff', fontWeight: 500, paddingRight: 12 }}>{task.title}</div>
      {task.description && (
        <div style={{ fontSize: 11, color: '#9890c0', marginTop: 6, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          {task.description}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
        <span style={{ ...priority, borderRadius: 4, padding: '1px 6px', fontSize: 10 }}>{`P${task.priority}`}</span>
        {task.due_date ? <span style={{ fontSize: 10, color: '#9890c0' }}>{new Date(task.due_date).toLocaleDateString()}</span> : null}
      </div>
    </div>
  );
}

export default function TasksPane() {
  const [boards, setBoards] = useState<Board[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [columns, setColumns] = useState<Column[]>([]);
  const [tasksByColumn, setTasksByColumn] = useState<Record<string, Task[]>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [draggingTask, setDraggingTask] = useState<Task | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const loadBoard = async (boardId: string) => {
    const cols = await (window as any).suki.getColumns(boardId) as Column[];
    setColumns(cols);
    const taskEntries = await Promise.all(cols.map(async column => [column.id, await (window as any).suki.getTasks(column.id) as Task[]] as const));
    setTasksByColumn(Object.fromEntries(taskEntries));
    setActiveBoardId(boardId);
  };

  useEffect(() => {
    const init = async () => {
      let rows = await (window as any).suki.getBoards() as Board[];
      if (rows.length === 0) {
        const boardId = await (window as any).suki.createBoard('Suki Tasks');
        for (const column of DEFAULT_COLUMNS) {
          await (window as any).suki.createColumn(boardId, column.name, column.color);
        }
        rows = await (window as any).suki.getBoards();
      }
      setBoards(rows);
      if (rows[0]) await loadBoard(rows[0].id);
    };
    void init();
  }, []);

  const activeBoard = useMemo(
    () => boards.find(board => board.id === activeBoardId) ?? boards[0] ?? null,
    [activeBoardId, boards],
  );

  const handleAddCard = async (columnId: string) => {
    const title = drafts[columnId]?.trim();
    if (!title) return;
    await (window as any).suki.createTask({ column_id: columnId, title, description: '', priority: 2 });
    setDrafts(prev => ({ ...prev, [columnId]: '' }));
    setEditingColumnId(null);
    if (activeBoardId) await loadBoard(activeBoardId);
  };

  const handleAddColumn = async () => {
    if (!activeBoardId) return;
    const name = window.prompt('Column name', `Column ${columns.length + 1}`);
    if (!name?.trim()) return;
    await (window as any).suki.createColumn(activeBoardId, name.trim(), '#5a5480');
    await loadBoard(activeBoardId);
  };

  const handleDeleteTask = async (taskId: string, columnId: string) => {
    await (window as any).suki.deleteTask(taskId);
    setTasksByColumn(prev => ({ ...prev, [columnId]: (prev[columnId] ?? []).filter(task => task.id !== taskId) }));
  };

  const handleDragStart = (event: any) => {
    const task = Object.values(tasksByColumn).flat().find(item => item.id === event.active.id) ?? null;
    setDraggingTask(task);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setDraggingTask(null);
    const { active, over } = event;
    if (!over || active.id === over.id || !activeBoardId) return;

    const sourceColumn = columns.find(column => (tasksByColumn[column.id] ?? []).some(task => task.id === active.id));
    const targetColumn = columns.find(column => column.id === over.id || (tasksByColumn[column.id] ?? []).some(task => task.id === over.id));
    if (!sourceColumn || !targetColumn) return;

    const sourceTasks = tasksByColumn[sourceColumn.id] ?? [];
    const targetTasks = tasksByColumn[targetColumn.id] ?? [];
    const sourceIndex = sourceTasks.findIndex(task => task.id === active.id);
    const overIndexInTarget = targetTasks.findIndex(task => task.id === over.id);

    if (sourceColumn.id === targetColumn.id) {
      const reordered = arrayMove(sourceTasks, sourceIndex, overIndexInTarget);
      setTasksByColumn(prev => ({ ...prev, [sourceColumn.id]: reordered.map((task, index) => ({ ...task, position: index })) }));
      await Promise.all(reordered.map((task, index) => (window as any).suki.updateTask(task.id, { position: index })));
      return;
    }

    const movedTask = sourceTasks[sourceIndex];
    const nextSource = sourceTasks.filter(task => task.id !== movedTask.id).map((task, index) => ({ ...task, position: index }));
    const targetIndex = overIndexInTarget >= 0 ? overIndexInTarget : targetTasks.length;
    const nextTarget = [...targetTasks];
    nextTarget.splice(targetIndex, 0, { ...movedTask, column_id: targetColumn.id, position: targetIndex });
    const normalizedTarget = nextTarget.map((task, index) => ({ ...task, position: index }));

    setTasksByColumn(prev => ({
      ...prev,
      [sourceColumn.id]: nextSource,
      [targetColumn.id]: normalizedTarget,
    }));

    await (window as any).suki.moveTask(movedTask.id, targetColumn.id, targetIndex);
    await Promise.all(nextSource.map((task, index) => (window as any).suki.updateTask(task.id, { position: index })));
    await Promise.all(normalizedTarget.filter(task => task.id !== movedTask.id).map((task, index) => (window as any).suki.updateTask(task.id, { position: index })));
  };

  return (
    <div className="animate-fade-in-up" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#0a0812' }}>
      <div style={{ height: 44, flexShrink: 0, background: '#0e0c1a', borderBottom: '1px solid #2d2850', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px' }}>
        <div style={{ fontSize: 16, color: '#e8e4ff', fontWeight: 500 }}>{activeBoard?.name ?? 'Tasks'}</div>
        <button onClick={() => void handleAddColumn()} style={{ color: '#5a5480', fontSize: 12 }}>Add Column</button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={event => void handleDragEnd(event)}>
        <div style={{ flex: 1, overflowX: 'auto', display: 'flex', background: '#0a0812' }}>
          {columns.map(column => {
            const tasks = tasksByColumn[column.id] ?? [];
            return (
              <div key={column.id} style={{ minWidth: 280, maxWidth: 280, height: '100%', overflowY: 'auto', borderRight: '1px solid #2d2850', background: '#0a0812' }}>
                <div style={{ height: 40, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', borderBottom: '1px solid #2d2850' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: column.color }} />
                    <span style={{ fontSize: 13, color: '#e8e4ff', fontWeight: 500 }}>{column.name}</span>
                    <span style={{ background: '#1a1730', color: '#5a5480', borderRadius: 10, padding: '1px 6px', fontSize: 11 }}>{tasks.length}</span>
                  </div>
                  <button style={{ color: '#5a5480' }}>⋮</button>
                </div>

                <SortableContext items={tasks.map(task => task.id)} strategy={verticalListSortingStrategy}>
                  <div style={{ paddingTop: 8 }}>
                    {tasks.map(task => (
                      <TaskCard key={task.id} task={task} onDelete={id => void handleDeleteTask(id, column.id)} />
                    ))}
                  </div>
                </SortableContext>

                <div style={{ padding: 8 }}>
                  {editingColumnId === column.id ? (
                    <input
                      autoFocus
                      value={drafts[column.id] ?? ''}
                      onChange={event => setDrafts(prev => ({ ...prev, [column.id]: event.target.value }))}
                      onKeyDown={event => {
                        if (event.key === 'Enter') void handleAddCard(column.id);
                        if (event.key === 'Escape') setEditingColumnId(null);
                      }}
                      style={{ width: '100%', background: '#110f1e', border: '1px solid #7c6ee0', borderRadius: 6, padding: 8, color: '#e8e4ff', fontSize: 13 }}
                    />
                  ) : (
                    <button onClick={() => setEditingColumnId(column.id)} style={{ color: '#5a5480', padding: '8px 12px', fontSize: 13, width: '100%', textAlign: 'left' }}>
                      + Add card
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <DragOverlay>
          {draggingTask ? (
            <div style={{ opacity: 0.9, transform: 'scale(1.02)', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
              <TaskCard task={draggingTask} dragging />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
