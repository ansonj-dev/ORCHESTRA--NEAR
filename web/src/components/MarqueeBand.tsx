type Props = { items: string[]; tone?: 'ink' | 'acid' | 'lilac'; reverse?: boolean };

export default function MarqueeBand({ items, tone = 'ink', reverse = false }: Props) {
  const row = [...items, ...items];
  return (
    <div className={`marquee marquee-${tone} ${reverse ? 'marquee-reverse' : ''}`} aria-hidden="true">
      <div className="marquee-track">
        {[0, 1].map((copy) => (
          <div className="marquee-row" key={copy}>
            {row.map((item, index) => <span key={`${copy}-${index}`}>{item}<b>✳</b></span>)}
          </div>
        ))}
      </div>
    </div>
  );
}
