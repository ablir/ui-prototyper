import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Renders raw Markdown text as styled HTML (see `.md-body` in styles.css). */
export function MarkdownView({ source }: { source: string }) {
  return (
    <div className="md-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>
    </div>
  );
}
