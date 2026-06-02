import { useEffect, useState } from 'react';
import {
  AppShell,
  Group,
  Title,
  Burger,
  NavLink,
  Badge,
  Anchor,
  Text,
  ScrollArea,
  Box,
  ThemeIcon,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Overview } from './pages/Overview';
import { SpecExplorer } from './pages/SpecExplorer';
import { UsageGuide } from './pages/UsageGuide';
import { REPO_URL } from './config';

type View = 'overview' | 'spec' | 'guide';

const NAV: { id: View; label: string; desc: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', desc: 'What the system is', icon: '◎' },
  { id: 'spec', label: 'Spec Explorer', desc: 'Browse every file + plain English', icon: '◧' },
  { id: 'guide', label: 'Usage Guide', desc: 'Build a banking dashboard, step by step', icon: '▸' },
];

function viewFromHash(): View {
  const h = window.location.hash.replace('#', '');
  return h === 'spec' || h === 'guide' ? h : 'overview';
}

export function App() {
  const [opened, { toggle, close }] = useDisclosure();
  const [view, setView] = useState<View>(viewFromHash);

  useEffect(() => {
    const onHash = () => setView(viewFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (v: View) => {
    window.location.hash = v;
    setView(v);
    close();
  };

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 280, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <ThemeIcon variant="gradient" gradient={{ from: 'indigo', to: 'cyan' }} size={34} radius="md">
              <Text fw={800} size="sm">AI</Text>
            </ThemeIcon>
            <Box>
              <Title order={4} lh={1}>AI Prototyping Studio</Title>
              <Text size="xs" c="dimmed" lh={1} mt={2}>
                Library-agnostic UI prototyping — an interactive walkthrough
              </Text>
            </Box>
          </Group>
          <Group gap="xs" visibleFrom="xs" wrap="nowrap">
            <Badge variant="light" color="teal" radius="sm">Mantine demo</Badge>
            <Anchor href={REPO_URL} target="_blank" size="sm" fw={600}>
              GitHub ↗
            </Anchor>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="sm">
        <ScrollArea h="100%" type="scroll">
          <Text size="xs" tt="uppercase" fw={700} c="dimmed" px="xs" mb={6}>
            Sections
          </Text>
          {NAV.map((n) => (
            <NavLink
              key={n.id}
              active={view === n.id}
              label={n.label}
              description={n.desc}
              leftSection={<Text aria-hidden>{n.icon}</Text>}
              onClick={() => go(n.id)}
              variant="light"
              mb={4}
            />
          ))}
          <Box px="xs" mt="lg">
            <Text size="xs" c="dimmed">
              A presentation of the build-from-scratch spec kit and the live AI flow that turns a
              UI library + a prompt into real, screenshotted React screens.
            </Text>
          </Box>
        </ScrollArea>
      </AppShell.Navbar>

      <AppShell.Main bg="dark.8">
        {view === 'overview' && <Overview onNavigate={(v) => go(v as View)} />}
        {view === 'spec' && <SpecExplorer />}
        {view === 'guide' && <UsageGuide />}
      </AppShell.Main>

      <a className="author-credit" href={REPO_URL} target="_blank" rel="noreferrer" title="View the source on GitHub">
        <span className="dot" aria-hidden />
        Crafted by&nbsp;<b>ablir</b>
      </a>
    </AppShell>
  );
}
