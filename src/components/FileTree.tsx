import { NavLink, Text, Box } from '@mantine/core';
import type { SpecFile } from '../data/specFiles';

interface TreeNode {
  name: string;
  // Either a folder (has children) or a leaf file.
  children: Map<string, TreeNode>;
  file?: SpecFile;
}

function buildTree(files: SpecFile[]): TreeNode {
  const root: TreeNode = { name: '', children: new Map() };
  for (const file of files) {
    const parts = file.path.split('/');
    let node = root;
    parts.forEach((part, i) => {
      const isLeaf = i === parts.length - 1;
      let child = node.children.get(part);
      if (!child) {
        child = { name: part, children: new Map() };
        node.children.set(part, child);
      }
      if (isLeaf) child.file = file;
      node = child;
    });
  }
  return root;
}

function fileLabel(name: string) {
  return name.endsWith('.md') ? '📄 ' + name : name;
}

function Nodes({
  node,
  depth,
  selectedPath,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  selectedPath: string;
  onSelect: (f: SpecFile) => void;
}) {
  // Folders first, then files, each alphabetical.
  const entries = [...node.children.values()].sort((a, b) => {
    const af = a.file ? 1 : 0;
    const bf = b.file ? 1 : 0;
    if (af !== bf) return af - bf;
    return a.name.localeCompare(b.name);
  });

  return (
    <>
      {entries.map((child) =>
        child.file ? (
          <NavLink
            key={child.file.path}
            label={fileLabel(child.name)}
            active={selectedPath === child.file!.path}
            onClick={() => onSelect(child.file!)}
            variant="light"
            pl={12 + depth * 14}
            styles={{ label: { fontSize: 13.5 } }}
          />
        ) : (
          <NavLink
            key={child.name}
            label={<Text fw={600} size="sm">📁 {child.name}</Text>}
            defaultOpened
            childrenOffset={0}
            pl={12 + depth * 14}
          >
            <Nodes node={child} depth={depth + 1} selectedPath={selectedPath} onSelect={onSelect} />
          </NavLink>
        ),
      )}
    </>
  );
}

export function FileTree({
  files,
  selectedPath,
  onSelect,
}: {
  files: SpecFile[];
  selectedPath: string;
  onSelect: (f: SpecFile) => void;
}) {
  const tree = buildTree(files);
  return (
    <Box>
      <Text size="xs" tt="uppercase" fw={700} c="dimmed" mb={6} px={8}>
        blueprint-spec-kit.zip
      </Text>
      <Nodes node={tree} depth={0} selectedPath={selectedPath} onSelect={onSelect} />
    </Box>
  );
}
