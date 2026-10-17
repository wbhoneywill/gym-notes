'use client';

import { useState } from 'react';
import { mediaForExercise } from '@/app/lib/exercise-media';

export default function ExerciseDemonstration({ exercise, compact = false }) {
  const [playing, setPlaying] = useState(false);
  const media = mediaForExercise(exercise);
  if (!media) return null;

  return (
    <details className={`exercise-demo${compact ? ' compact' : ''}`}>
      <summary>
        <span><strong>How to perform</strong><small>Visual demonstration</small></span>
        <span aria-hidden="true">+</span>
      </summary>
      <div className="exercise-demo-content">
        {media.animation && playing ? (
          <div className="exercise-demo-animation">
            <img src={media.animation} alt={`${media.providerName} looping demonstration`} />
            <button type="button" className="btn btn-secondary" onClick={() => setPlaying(false)}>Show key positions</button>
          </div>
        ) : (
          <div className="exercise-demo-frames">
            <figure><img src={media.startImage} alt={`${media.providerName} starting position`} /><figcaption>Start</figcaption></figure>
            <figure><img src={media.finishImage} alt={`${media.providerName} finishing position`} /><figcaption>Finish</figcaption></figure>
          </div>
        )}
        {media.animation && !playing && (
          <button type="button" className="btn exercise-demo-play" onClick={() => setPlaying(true)}>Play animation</button>
        )}
        {!media.animation && (
          <p className="exercise-demo-note">Compare the start and finish positions, then follow the movement with a controlled range of motion.</p>
        )}
        <p className="exercise-demo-credit">
          <a href={media.sourceUrl} target="_blank" rel="noreferrer">Visuals from {media.provider}</a>
          {' · '}
          <a href={media.licenseUrl} target="_blank" rel="noreferrer">{media.license}</a>
        </p>
      </div>
    </details>
  );
}
