'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { filterHelpSections, helpSections } from '@/app/lib/help-content';

const journey = [
  ['1', 'Exercises', 'Find movements by body part or add a personal exercise.'],
  ['2', 'Plans', 'Arrange reusable routines and optional targets.'],
  ['3', 'Train', 'Record weight and repetitions, then mark performed sets Done.'],
  ['4', 'History', 'Review the workout and its completed working volume.'],
  ['5', 'Progress', 'Compare exercise performance and body-group volume over time.'],
];

export default function HelpPage() {
  const [query, setQuery] = useState('');
  const visibleSections = useMemo(() => filterHelpSections(helpSections, query), [query]);
  const resultCount = visibleSections.reduce((sum, section) => sum + section.items.length, 0);

  return (
    <main className="container help-page">
      <header className="page-header">
        <p className="eyebrow">Guidance</p>
        <h1 className="page-title">Help & FAQ</h1>
        <p className="page-lead">Understand each section and get more value from every workout.</p>
      </header>

      <section className="help-journey" aria-labelledby="journey-title">
        <div className="section-heading"><div><p className="eyebrow">Start here</p><h2 id="journey-title">The GymNotes flow</h2></div></div>
        <ol>
          {journey.map(([number, title, description]) => (
            <li key={number}><span>{number}</span><div><strong>{title}</strong><p>{description}</p></div></li>
          ))}
        </ol>
      </section>

      <div className="help-search field">
        <label htmlFor="help-search">Search questions</label>
        <input
          id="help-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Try “volume”, “plan”, or “Done”"
          autoComplete="off"
        />
        {query && <span className="meta" role="status">{resultCount} {resultCount === 1 ? 'answer' : 'answers'} found</span>}
      </div>

      {visibleSections.length === 0 ? (
        <div className="empty-state"><strong>No matching answer</strong><span>Try a shorter term or browse all questions.</span><button className="btn btn-secondary" type="button" onClick={() => setQuery('')}>Clear search</button></div>
      ) : (
        <div className="faq-sections">
          {visibleSections.map((section) => (
            <section id={section.id} key={section.id} className="faq-section">
              <div className="section-heading"><div><p className="eyebrow">Learn</p><h2>{section.title}</h2><p>{section.description}</p></div><span className="count-badge">{section.items.length}</span></div>
              <div className="faq-list">
                {section.items.map((item, index) => (
                  <details key={item.question} open={Boolean(query) && index === 0}>
                    <summary>{item.question}<span aria-hidden="true">+</span></summary>
                    <p>{item.answer}</p>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <p className="help-footer"><Link href="/settings">Settings</Link> · <Link href="/dashboard">Dashboard</Link></p>
    </main>
  );
}
