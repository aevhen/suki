import React, { useCallback, useEffect, useMemo, useState } from 'react';

export interface FileNode {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileNode[];
}

interface Props {
  projectRoot: string | null;
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
  onProjectRootChange: (root: string | null) => void;
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'dist-electron', '.suki']);

function joinPath(base: string, name: string): string {
  const separator = base.includes('\\') ? '\\' : '/';
  return `${base}${base.endsWith(separator) ? '' : separator}${name}`;
}

function getExtensionColor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: '#7c6ee0',
    tsx: '#7c6ee0',
    js: '#f0b429',
    jsx: '#f0b429',
    py: '#3dd68c',
    json: '#60a8e0',
    md: '#9890c0',
    css: '#e8638e',
    scss: '#e8638e',
  };
  return map[ext] ?? '#5a5480';
}

export default function FileTree({ projectRoot, selectedFile, onSelectFile, onProjectRootChange }: Props) {
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const buildTree = useCallback(async (dir: string): Promise<FileNode[]> => {
    const names = await (window as any).suki.listFiles(dir) as string[];
    const nodes = await Promise.all(
      names
        .filter(name => !SKIP_DIRS.has(name))
        .map(async name => {
          const path = joinPath(dir, name);
          try {
            const children = await buildTree(path);
            return { name, path, isDir: true, children } satisfies FileNode;
          } catch {
            return { name, path, isDir: false } satisfies FileNode;
          }
        }),
    );

    return nodes.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, []);

  const loadProject = useCallback(async (root: string) => {
    setLoading(true);
    try {
      const tree = await buildTree(root);
      setFileTree(tree);
      setExpandedDirs(new Set([root]));
      onProjectRootChange(root);
    } finally {
      setLoading(false);
    }
  }, [buildTree, onProjectRootChange]);

  const handleOpenFolder = useCallback(async () => {
    const root = await (window as any).suki.openFolder();
    if (!root) return;
    await loadProject(root);
  }, [loadProject]);

  useEffect(() => {
    if (!projectRoot) {
      setFileTree([]);
      setExpandedDirs(new Set());
    }
  }, [projectRoot]);

  const rootLabel = useMemo(() => {
    if (!projectRoot) return 'Open Folder';
    const parts = projectRoot.split(/[/\\]/);
    return parts[parts.length - 1] || projectRoot;
  }, [projectRoot]);

  const toggleDir = (path: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const renderNode = (node: FileNode, depth: number): React.ReactNode => {
    const isExpanded = expandedDirs.has(node.path);
    const isActive = selectedFile === node.path;
    const paddingLeft = 12 + depth * 16;

    return (
      <React.Fragment key={node.path}>
        <button
          onClick={() => {
            if (node.isDir) toggleDir(node.path);
            else onSelectFile(node.path);
          }}
          style={{
            height: 24,
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            paddingLeft,
            paddingRight: 12,
            background: isActive ? '#1a1730' : 'transparent',
            color: isActive ? '#e8e4ff' : '#9890c0',
            borderLeft: `2px solid ${isActive ? '#7c6ee0' : 'transparent'}`,
            fontSize: 12,
            fontFamily: 'JetBrains Mono, Fira Code, Cascadia Code, Consolas, monospace',
            justifyContent: 'flex-start',
            transition: 'all 0.15s ease',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}
          onMouseEnter={event => {
            if (!isActive) event.currentTarget.style.background = '#110f1e';
          }}
          onMouseLeave={event => {
            if (!isActive) event.currentTarget.style.background = 'transparent';
          }}
          title={node.path}
        >
          {node.isDir ? (
            <span style={{ color: '#5a5480', width: 12, flexShrink: 0 }}>{isExpanded ? '▼' : '▶'}</span>
          ) : (
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: getExtensionColor(node.name), flexShrink: 0 }} />
          )}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{node.name}</span>
        </button>
        {node.isDir && isExpanded && node.children?.map(child => renderNode(child, depth + 1))}
      </React.Fragment>
    );
  };

  return (
    <div
      style={{
        width: 240,
        flexShrink: 0,
        background: '#0a0812',
        borderRight: '1px solid #2d2850',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <button
        onClick={handleOpenFolder}
        style={{
          height: 36,
          flexShrink: 0,
          color: '#5a5480',
          borderBottom: '1px solid #2d2850',
          fontSize: 12,
          fontFamily: 'JetBrains Mono, Fira Code, Cascadia Code, Consolas, monospace',
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={event => {
          event.currentTarget.style.color = '#7c6ee0';
          event.currentTarget.style.background = '#110f1e';
        }}
        onMouseLeave={event => {
          event.currentTarget.style.color = '#5a5480';
          event.currentTarget.style.background = 'transparent';
        }}
      >
        {projectRoot ? rootLabel : 'Open Folder'}
      </button>

      <div style={{ padding: loading ? 12 : 0, color: '#5a5480', fontSize: 12 }}>
        {loading ? 'Loading files...' : fileTree.map(node => renderNode(node, 0))}
      </div>
    </div>
  );
}
