'use client';

import Body from 'react-muscle-highlighter';
import { visualForBodyGroup } from '@/app/lib/body-map';

export default function ExerciseBodyPreview({ exercise, compact = false }) {
  const visual = visualForBodyGroup(exercise?.primary_muscle_group);
  const exerciseName = exercise?.name ?? exercise?.exercise_name;
  const highlighted = visual?.slugs.map((slug) => ({
    slug,
    color: 'var(--accent)',
  })) ?? [];

  return (
    <div className={`exercise-body-preview${exercise ? ' has-selection' : ''}${compact ? ' compact' : ''}`} aria-live="polite">
      <div className="exercise-body-preview-figure" aria-hidden="true">
        {visual ? (
          <Body
            data={highlighted}
            side={visual.view}
            scale={compact ? 0.3 : 0.42}
            border="var(--body-map-border)"
            defaultFill="var(--body-map-fill)"
          />
        ) : (
          <span className="body-preview-placeholder">?</span>
        )}
      </div>
      <div className="exercise-body-preview-copy">
        <span className="eyebrow">Primary target</span>
        {exercise ? (
          <>
            <strong>{exercise.primary_muscle_group || 'Not categorized'}</strong>
            {exerciseName && <span>{exerciseName}</span>}
            {exercise.equipment && <small>{exercise.equipment}</small>}
          </>
        ) : (
          <>
            <strong>Choose an exercise</strong>
            <span>Its primary body area will appear here.</span>
          </>
        )}
      </div>
    </div>
  );
}
