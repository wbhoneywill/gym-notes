import Link from 'next/link';

export default function HelpLink({ topic, children = 'How this works' }) {
  return (
    <Link className="context-help-link" href={`/help${topic ? `#${topic}` : ''}`}>
      <span aria-hidden="true">?</span>
      {children}
    </Link>
  );
}
