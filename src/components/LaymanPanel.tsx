import { Paper, Stack, Text, ThemeIcon, Group, List, Divider, Badge } from '@mantine/core';
import type { SpecFile } from '../data/specFiles';

/** The "explain it to me like I'm not an engineer" sidebar for the open file. */
export function LaymanPanel({ file }: { file: SpecFile }) {
  const { layman } = file;
  return (
    <Paper withBorder radius="md" p="lg" bg="indigo.0" style={{ position: 'sticky', top: 12 }}>
      <Stack gap="sm">
        <Group gap="xs">
          <ThemeIcon variant="filled" color="indigo" radius="xl" size={28}>
            <Text fw={800} size="sm">i</Text>
          </ThemeIcon>
          <Badge variant="white" color="indigo" radius="sm">
            In plain English
          </Badge>
        </Group>

        <Text fw={700} size="md" lh={1.3}>
          {layman.tagline}
        </Text>

        <Text size="sm" c="gray.7">
          {layman.body}
        </Text>

        {layman.bullets && layman.bullets.length > 0 && (
          <>
            <Divider label="In a nutshell" labelPosition="left" my={4} />
            <List size="sm" spacing={6} c="gray.7">
              {layman.bullets.map((b, i) => (
                <List.Item key={i}>{b}</List.Item>
              ))}
            </List>
          </>
        )}

        <Divider my={4} />
        <Text size="xs" c="dimmed">
          You are reading the real file:{' '}
          <Text span ff="monospace" fw={600}>
            {file.path}
          </Text>
        </Text>
      </Stack>
    </Paper>
  );
}
