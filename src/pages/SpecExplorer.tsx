import { useMemo, useState } from 'react';
import { Grid, Paper, ScrollArea, Box, Title, Text, Group, Badge, Container, Button } from '@mantine/core';
import { FileTree } from '../components/FileTree';
import { MarkdownView } from '../components/MarkdownView';
import { LaymanPanel } from '../components/LaymanPanel';
import { SPEC_FILES, getContent, type SpecFile } from '../data/specFiles';

const DEFAULT = SPEC_FILES.find((f) => f.path === 'blueprint/00-overview.md') ?? SPEC_FILES[0];

export function SpecExplorer() {
  const [selected, setSelected] = useState<SpecFile>(DEFAULT);
  const content = useMemo(() => getContent(selected), [selected]);

  return (
    <Container size="xl" px={0}>
      <Box mb="md">
        <Group justify="space-between" align="center" wrap="nowrap">
          <Group gap="sm" align="center">
            <Title order={2}>Spec Explorer</Title>
            <Badge variant="light" color="indigo">{SPEC_FILES.length} files</Badge>
          </Group>
          <Button
            component="a"
            href={`${import.meta.env.BASE_URL}blueprint-spec-kit.zip`}
            download
            variant="light"
            radius="md"
            leftSection={<Text aria-hidden fz={16} lh={1}>⤓</Text>}
          >
            Download .zip
          </Button>
        </Group>
        <Text c="dimmed" size="sm" mt={4}>
          Browse the full <Text span ff="monospace">blueprint-spec-kit.zip</Text>. The center pane shows
          the real file; the right pane explains it in plain English.
        </Text>
      </Box>

      <Grid gutter="md" align="stretch">
        {/* File tree */}
        <Grid.Col span={{ base: 12, sm: 3 }}>
          <Paper withBorder radius="md" p="xs">
            <ScrollArea.Autosize mah="calc(100vh - 220px)" type="hover">
              <FileTree files={SPEC_FILES} selectedPath={selected.path} onSelect={setSelected} />
            </ScrollArea.Autosize>
          </Paper>
        </Grid.Col>

        {/* File content */}
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <Paper withBorder radius="md" p="lg">
            <Group justify="space-between" mb="sm">
              <Text ff="monospace" fw={600} size="sm">{selected.path}</Text>
              <Badge variant="dot" color="teal" size="sm">{selected.title}</Badge>
            </Group>
            <ScrollArea.Autosize mah="calc(100vh - 260px)" type="hover" offsetScrollbars>
              <MarkdownView source={content} />
            </ScrollArea.Autosize>
          </Paper>
        </Grid.Col>

        {/* Layman sidebar */}
        <Grid.Col span={{ base: 12, sm: 3 }}>
          <LaymanPanel file={selected} />
        </Grid.Col>
      </Grid>
    </Container>
  );
}
