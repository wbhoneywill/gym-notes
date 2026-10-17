'use client';

import { useEffect, useState } from 'react';
import Body from 'react-muscle-highlighter';
import {
  BACK_BODY_FILTER,
  FRONT_BODY_FILTER,
  bodyGroupForSlug,
  visualForBodyGroup,
} from '@/app/lib/body-map';

export default function BodyGroupSelector({ activeGroup, availableGroups, onSelect }) {
  const activeVisual = visualForBodyGroup(activeGroup);
  const [view, setView] = useState(activeVisual?.view ?? 'front');
  const highlighted = activeVisual?.slugs.map((slug) => ({
    slug,
    color: 'var(--accent)',
  })) ?? [];

  useEffect(() => {
    if (activeVisual?.view) setView(activeVisual.view);
  }, [activeVisual?.view]);

  function selectFromBody(part) {
    const group = bodyGroupForSlug(part.slug, availableGroups);
    if (group) onSelect(group);
  }

  function selectGroup(group) {
    const visual = visualForBodyGroup(group);
    if (visual) setView(visual.view);
    onSelect(group);
  }

  function selectView(side) {
    setView(side);
    onSelect(side === 'front' ? FRONT_BODY_FILTER : BACK_BODY_FILTER);
  }

  const isFrontFilter = activeGroup === FRONT_BODY_FILTER;
  const isBackFilter = activeGroup === BACK_BODY_FILTER;
  const isSideFilter = isFrontFilter || isBackFilter;
  const sideLabel = isFrontFilter ? 'Front' : 'Back';
  const selectionTitle = isSideFilter ? `${sideLabel} body` : activeGroup;
  const selectionDescription = activeGroup === 'All'
    ? 'All exercises are currently shown.'
    : isSideFilter
      ? `Showing exercises with primary targets on the ${sideLabel.toLowerCase()} of the body.`
      : `Showing exercises that primarily train ${activeGroup.toLowerCase()}.`;

  return (
    <section className="body-selector" aria-labelledby="body-selector-title">
      <div className="body-selector-copy">
        <p className="eyebrow">Visual guide</p>
        <h3 id="body-selector-title">Where do you want to train?</h3>
        <p>Tap the body or choose a label. The highlighted area shows the primary target.</p>
      </div>

      <div className="body-selector-stage">
        <div className="body-selector-figure" aria-hidden="true">
          <Body
            data={highlighted}
            side={view}
            scale={0.66}
            border="var(--body-map-border)"
            defaultFill="var(--body-map-fill)"
            onBodyPartPress={selectFromBody}
          />
          <span>{view === 'front' ? 'Front' : 'Back'}</span>
        </div>

        <div className="body-selector-controls">
          <div className="segmented-control compact" aria-label="Body view">
            {['front', 'back'].map((side) => (
              <button
                key={side}
                type="button"
                className={view === side ? 'active' : ''}
                aria-pressed={view === side}
                onClick={() => selectView(side)}
              >
                {side === 'front' ? 'Front' : 'Back'}
              </button>
            ))}
          </div>
          <strong>{activeGroup === 'All' ? 'Select a body group' : selectionTitle}</strong>
          <span>{selectionDescription}</span>
          {activeGroup !== 'All' && (
            <button className="text-button" type="button" onClick={() => selectGroup('All')}>
              Show all exercises
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
