import { CodeHighlight } from '@mantine/code-highlight';

/** Syntax-highlighted, copyable code block. */
export function CodeBlock({
  code,
  language = 'tsx',
}: {
  code: string;
  language?: string;
}) {
  return <CodeHighlight code={code} language={language} withCopyButton />;
}
