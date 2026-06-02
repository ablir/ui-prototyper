import {
  Container,
  Title,
  Text,
  Button,
  Group,
  SimpleGrid,
  Card,
  ThemeIcon,
  Badge,
  Stack,
  Paper,
  Timeline,
  List,
  Box,
  Divider,
  Table,
} from '@mantine/core';

const HOOKS = [
  {
    n: '1',
    title: 'Analyze',
    color: 'indigo',
    body: 'An AI reads the library’s source and types, then shelves a structured profile + a human/AI-readable REFERENCE.md.',
    out: 'LibraryProfile',
  },
  {
    n: '2',
    title: 'Select',
    color: 'violet',
    body: 'Given your prompt, the AI gauges which components fit — and honestly flags what the library cannot do.',
    out: 'ComponentPlan (+ gaps)',
  },
  {
    n: '3',
    title: 'Generate',
    color: 'grape',
    body: 'The AI writes real .tsx using only that library, and every imported symbol is audited against the profile.',
    out: 'import-audited .tsx',
  },
  {
    n: '4',
    title: 'Render',
    color: 'teal',
    body: 'A non-AI step bundles the REAL installed library with Vite and captures a true Playwright screenshot.',
    out: 'screenshot.png',
  },
];

const PROVIDERS = [
  ['Tier 1', 'ANTHROPIC_API_KEY set', 'AnthropicProvider', 'Calls the Claude API directly.'],
  ['Tier 2', 'claude CLI on PATH', 'ClaudeCodeProvider', 'Claude Code runs the hooks at a fresh context.'],
  ['Tier 3', 'neither', 'ShelfProvider', 'Replays a cached response — fully offline & deterministic.'],
];

export function Overview({ onNavigate }: { onNavigate: (v: string) => void }) {
  return (
    <Container size="lg" px={0}>
      {/* Hero */}
      <Paper
        radius="lg"
        p="xl"
        mb="xl"
        style={{
          background: 'linear-gradient(135deg, var(--mantine-color-indigo-6), var(--mantine-color-cyan-5))',
          color: 'white',
        }}
      >
        <Badge color="white" variant="white" c="indigo.7" mb="md">
          Build-from-scratch spec kit + live AI flow
        </Badge>
        <Title order={1} fz={{ base: 30, sm: 42 }} lh={1.1} maw={760}>
          Point at any React UI library. Describe a screen. Get real code and a true screenshot.
        </Title>
        <Text mt="md" maw={680} opacity={0.95}>
          This site is an interactive walkthrough of an AI-driven, library-agnostic prototyping
          system. Browse the entire specification in plain English, then follow a real run that
          turns <b>Mantine</b> + a prompt into a <b>Banking Portfolio &mdash; Client Assets</b> dashboard.
        </Text>
        <Group mt="xl">
          <Button size="md" variant="white" color="indigo" onClick={() => onNavigate('guide')}>
            See the live walkthrough
          </Button>
          <Button
            size="md"
            variant="outline"
            color="white"
            onClick={() => onNavigate('spec')}
            styles={{ root: { borderColor: 'rgba(255,255,255,0.6)', color: 'white' } }}
          >
            Explore the spec
          </Button>
        </Group>
      </Paper>

      {/* North star */}
      <Paper withBorder radius="md" p="lg" mb="xl">
        <Group gap="sm" mb={6}>
          <ThemeIcon variant="light" color="yellow" radius="xl" size={30}>
            <Text fw={800}>★</Text>
          </ThemeIcon>
          <Title order={3}>The North Star</Title>
        </Group>
        <Text c="dimmed">
          The engine <b>never hardcodes a single library&rsquo;s</b> components, data, colors, or theme.
          It learns each library at runtime and reasons entirely over the profile it shelved &mdash;
          so the very same pipeline works for Ant Design, MUI, Mantine, or your in-house library.
        </Text>
      </Paper>

      {/* The four steps */}
      <Title order={2} mb="xs">How it works &mdash; four steps</Title>
      <Text c="dimmed" mb="lg">Three AI &ldquo;hooks&rdquo; plus one real render. Two artifacts every time: the code and the screenshot.</Text>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} mb="xl">
        {HOOKS.map((h) => (
          <Card key={h.n} withBorder radius="md" padding="lg">
            <Group gap="xs" mb="sm">
              <ThemeIcon variant="filled" color={h.color} radius="xl" size={34}>
                <Text fw={800}>{h.n}</Text>
              </ThemeIcon>
              <Title order={4}>{h.title}</Title>
            </Group>
            <Text size="sm" c="dimmed" mb="md">{h.body}</Text>
            <Badge variant="light" color={h.color} radius="sm">{h.out}</Badge>
          </Card>
        ))}
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl">
        {/* Data flow */}
        <Paper withBorder radius="md" p="lg">
          <Title order={3} mb="md">The data flow</Title>
          <Timeline active={5} bulletSize={22} lineWidth={2} color="indigo">
            <Timeline.Item title="A UI library">
              <Text size="sm" c="dimmed">npm spec, git url, owner/repo, or a local path.</Text>
            </Timeline.Item>
            <Timeline.Item title="Analyze → profile + REFERENCE.md">
              <Text size="sm" c="dimmed">Shelved once, reused forever (cheap from then on).</Text>
            </Timeline.Item>
            <Timeline.Item title="Select → ComponentPlan">
              <Text size="sm" c="dimmed">Which components fit your prompt, and the gaps.</Text>
            </Timeline.Item>
            <Timeline.Item title="Generate → .tsx">
              <Text size="sm" c="dimmed">Real, import-audited code using only that library.</Text>
            </Timeline.Item>
            <Timeline.Item title="Render → screenshot.png">
              <Text size="sm" c="dimmed">The actual library, bundled & photographed by Playwright.</Text>
            </Timeline.Item>
            <Timeline.Item title="Shelve → versioned">
              <Text size="sm" c="dimmed">prototypes/&#123;id&#125;/v&#123;N&#125;/ &mdash; history is never overwritten.</Text>
            </Timeline.Item>
          </Timeline>
        </Paper>

        {/* Providers + exposure */}
        <Stack>
          <Paper withBorder radius="md" p="lg">
            <Title order={3} mb="sm">One pipeline, three AI back-ends</Title>
            <Text size="sm" c="dimmed" mb="md">
              Chosen automatically by <Text span ff="monospace">getProvider()</Text> &mdash; you control it purely with environment variables.
            </Text>
            <Table verticalSpacing="xs" fz="sm" withRowBorders={false}>
              <Table.Tbody>
                {PROVIDERS.map((p) => (
                  <Table.Tr key={p[0]}>
                    <Table.Td><Badge variant="light" color="indigo" radius="sm">{p[0]}</Badge></Table.Td>
                    <Table.Td><Text size="xs" ff="monospace">{p[1]}</Text></Table.Td>
                    <Table.Td><Text size="xs" c="dimmed">{p[3]}</Text></Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            <Text size="xs" c="dimmed" mt="sm">
              This demo was produced live using <b>Tier 2</b> (the <Text span ff="monospace">claude</Text> CLI).
            </Text>
          </Paper>

          <Paper withBorder radius="md" p="lg">
            <Title order={3} mb="sm">Exposed three ways</Title>
            <List size="sm" spacing="xs">
              <List.Item><b>CLI</b> &mdash; <Text span ff="monospace">analyze-cli.ts</Text> &amp; <Text span ff="monospace">run-flow.ts</Text>.</List.Item>
              <List.Item><b>Express API</b> &mdash; shells the CLIs, streams progress over SSE.</List.Item>
              <List.Item><b>React web app</b> &mdash; Libraries / Generate / History tabs.</List.Item>
            </List>
            <Divider my="md" />
            <Box>
              <Text fw={600} size="sm" mb={4}>What to do here</Text>
              <Group>
                <Button size="xs" variant="light" onClick={() => onNavigate('spec')}>Read the spec in plain English</Button>
                <Button size="xs" variant="light" color="teal" onClick={() => onNavigate('guide')}>Watch the banking build</Button>
              </Group>
            </Box>
          </Paper>
        </Stack>
      </SimpleGrid>
    </Container>
  );
}
