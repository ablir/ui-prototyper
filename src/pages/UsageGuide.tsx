import { useState } from 'react';
import {
  Container,
  Title,
  Text,
  Paper,
  Group,
  Badge,
  Stack,
  Image,
  Grid,
  ThemeIcon,
  Box,
  Modal,
  Alert,
  Divider,
  List,
  SimpleGrid,
  Anchor,
} from '@mantine/core';
import { STEPS } from '../data/steps';
import { BANKING } from '../data/banking';
import { CodeBlock } from '../components/CodeBlock';

/** Resolve a public/ asset under the current base path (works on Vercel and GitHub Pages). */
function asset(name: string) {
  return `${import.meta.env.BASE_URL}screenshots/${name}`;
}

export function UsageGuide() {
  const [zoom, setZoom] = useState<{ src: string; alt: string } | null>(null);

  return (
    <Container size="lg" px={0}>
      <Box mb="xl">
        <Title order={2}>Usage Guide</Title>
        <Text c="dimmed" size="sm" mt={4} maw={760}>
          A real, end-to-end run of the AI Prototyping Studio. We teach it the <b>Mantine</b> library,
          then ask it for a <b>Banking Portfolio &mdash; Client Assets</b> dashboard. Every screenshot
          below was captured live from the running app.
        </Text>
        <Group mt="sm" gap="xs">
          <Badge variant="light" color="indigo">Library: @mantine/core</Badge>
          <Badge variant="light" color="teal">7 steps</Badge>
          <Badge variant="light" color="grape">Real screenshots</Badge>
        </Group>
      </Box>

      <Stack gap="xl">
        {STEPS.map((s) => (
          <Paper key={s.n} withBorder radius="md" p="lg">
            <Grid gutter="xl" align="center">
              {/* Text side */}
              <Grid.Col span={{ base: 12, md: 5 }} order={{ base: 2, md: s.n % 2 === 0 ? 2 : 1 }}>
                <Group gap="sm" mb="xs">
                  <ThemeIcon variant="filled" color="indigo" radius="xl" size={34}>
                    <Text fw={800}>{s.n}</Text>
                  </ThemeIcon>
                  <Title order={3}>{s.title}</Title>
                </Group>
                <Text fw={600} c="indigo.7" mb={6}>{s.action}</Text>
                <Text size="sm" c="gray.7">{s.plain}</Text>
                {s.behind && (
                  <Alert variant="light" color="gray" mt="md" p="sm" radius="md">
                    <Text size="xs" c="dimmed">
                      <b>Behind the scenes:</b> {s.behind}
                    </Text>
                  </Alert>
                )}
              </Grid.Col>

              {/* Image side */}
              <Grid.Col span={{ base: 12, md: 7 }} order={{ base: 1, md: s.n % 2 === 0 ? 1 : 2 }}>
                <Paper
                  withBorder
                  radius="md"
                  p={4}
                  bg="gray.1"
                  style={{ cursor: 'zoom-in', overflow: 'hidden' }}
                  onClick={() => setZoom({ src: asset(s.image), alt: s.title })}
                >
                  <Image
                    src={asset(s.image)}
                    alt={s.title}
                    radius="sm"
                    fallbackSrc="https://placehold.co/800x500?text=screenshot"
                  />
                </Paper>
                <Text size="xs" c="dimmed" ta="center" mt={6}>{s.caption} &middot; click to enlarge</Text>
              </Grid.Col>
            </Grid>
          </Paper>
        ))}

        {/* Banking showcase */}
        <Divider
          my="md"
          label={<Badge size="lg" variant="filled" color="teal">The result: a real Mantine screen</Badge>}
          labelPosition="center"
        />

        <Paper withBorder radius="md" p="lg">
          <Title order={2} mb={4}>Banking Portfolio &mdash; Client Assets</Title>
          <Text c="dimmed" size="sm" mb="lg">
            Rendered with the <b>real</b> {BANKING.library} library (v{BANKING.version}) and photographed by
            Playwright &mdash; not a mock-up. This single screen exercises a large slice of Mantine&rsquo;s
            component set.
          </Text>

          <Paper
            withBorder
            radius="md"
            p={4}
            bg="gray.1"
            style={{ cursor: 'zoom-in' }}
            onClick={() => setZoom({ src: asset(BANKING.screenshot), alt: 'Banking Portfolio dashboard' })}
          >
            <Image
              src={asset(BANKING.screenshot)}
              alt="Banking Portfolio — Client Assets dashboard rendered with Mantine"
              radius="sm"
              fallbackSrc="https://placehold.co/1200x800?text=Banking+Portfolio+dashboard"
            />
          </Paper>
          <Text size="xs" c="dimmed" ta="center" mt={6}>Click to enlarge</Text>

          <SimpleGrid cols={{ base: 1, md: 2 }} mt="xl" spacing="xl">
            <Box>
              <Title order={4} mb="sm">Components the AI chose</Title>
              {BANKING.chosenComponents.length > 0 ? (
                <Group gap={6}>
                  {BANKING.chosenComponents.map((c) => (
                    <Badge key={c} variant="light" color="indigo" radius="sm">{c}</Badge>
                  ))}
                </Group>
              ) : (
                <Text size="sm" c="dimmed">Populated from the live run.</Text>
              )}
            </Box>
            <Box>
              <Title order={4} mb="sm">Capability gaps (reported, not faked)</Title>
              {BANKING.gaps.length > 0 ? (
                <List size="sm" spacing={6}>
                  {BANKING.gaps.map((g, i) => (
                    <List.Item key={i}>
                      <Text span fw={600}>{g.need}</Text>
                      {g.note ? <Text span c="dimmed"> &mdash; {g.note}</Text> : null}
                    </List.Item>
                  ))}
                </List>
              ) : (
                <Text size="sm" c="dimmed">No blocking gaps were reported for this request.</Text>
              )}
            </Box>
          </SimpleGrid>

          <Divider my="xl" label="The generated code" labelPosition="left" />
          <CodeBlock code={BANKING.code} language="tsx" />
        </Paper>

        <Paper withBorder radius="md" p="lg" bg="indigo.0">
          <Text size="sm" c="gray.7">
            Want to run it yourself? The full build + run instructions live in the spec&rsquo;s{' '}
            <Anchor href="#spec">Runbook (07)</Anchor>. The same flow works against Ant Design, MUI,
            or any importable React component library.
          </Text>
        </Paper>
      </Stack>

      {/* Lightbox */}
      <Modal
        opened={!!zoom}
        onClose={() => setZoom(null)}
        size="auto"
        centered
        withCloseButton
        title={zoom?.alt}
      >
        {zoom && <Image src={zoom.src} alt={zoom.alt} fit="contain" mah="80vh" />}
      </Modal>
    </Container>
  );
}
