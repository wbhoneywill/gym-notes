export const helpSections = [
  {
    id: 'getting-started',
    title: 'Getting started',
    description: 'The shortest path from an idea to a recorded workout.',
    items: [
      {
        question: 'What is the recommended GymNotes workflow?',
        answer: 'Choose or create exercises, build a reusable plan, start training from that plan, record and complete each set, then review the workout in History and longer-term trends in Progress.',
      },
      {
        question: 'Do I need to create a plan before training?',
        answer: 'No. You can start a blank workout from Train and add exercises as you go. Plans are useful when you repeat a routine.',
      },
      {
        question: 'Does GymNotes work offline?',
        answer: 'Yes for the recorder after preparation: open Train and the workout once while online in the installed production app. Blank workouts and cached plans can then run offline, with exercise and set changes synchronized later. Editing plans, resolving a sync conflict, and unvisited screens still require connectivity.',
      },
      {
        question: 'How do I install GymNotes on my iPhone?',
        answer: 'Open GymNotes in Safari, tap the Share button, choose Add to Home Screen, then tap Add. You can also find device-specific installation guidance in Settings.',
      },
      {
        question: 'Can I change my onboarding choices later?',
        answer: 'Yes. Open Settings and select Training profile to change your preferred unit, main goal, experience level, or planned training days. Updating the profile does not change workout history or create another starter plan.',
      },
    ],
  },
  {
    id: 'plans',
    title: 'Plans',
    description: 'Prepare reusable routines without changing past results.',
    items: [
      {
        question: 'What is a workout plan?',
        answer: 'A plan is a reusable workout template. It stores an ordered exercise list and optional targets for sets, repetitions, weight, and rest time.',
      },
      {
        question: 'What is the difference between a plan and a workout?',
        answer: 'A plan describes what you intend to do. A workout records what you actually performed on a particular day.',
      },
      {
        question: 'Does editing a plan change workout history?',
        answer: 'No. Starting training creates a session-specific copy of the plan. Later plan edits do not change workouts that were already started or completed.',
      },
      {
        question: 'When should I duplicate a plan?',
        answer: 'Duplicate a plan when you want a variation, such as Push A and Push B, while keeping the original routine unchanged.',
      },
      {
        question: 'What happens when I archive a plan?',
        answer: 'The plan is removed from your active list. Workouts previously created from it remain available in History.',
      },
      {
        question: 'How does the weekly workout schedule work?',
        answer: 'On Plans, assign a reusable plan to a weekday and optionally choose your preferred time. The schedule organizes your intended week, but it never starts a workout automatically. You remain in control of when training begins.',
      },
      {
        question: 'Will a scheduled workout send a notification?',
        answer: 'Not yet. The current schedule is an in-app weekly planning view. Push reminders are intentionally deferred until they can be implemented reliably and with explicit permission.',
      },
    ],
  },
  {
    id: 'training',
    title: 'Training and sets',
    description: 'Record reliable results while you are in the gym.',
    items: [
      {
        question: 'What is a working set?',
        answer: 'A working set is a completed, non-warm-up set. It counts toward your working-set total, training volume, history, and progress calculations.',
      },
      {
        question: 'Why should I mark a set Done?',
        answer: 'Done confirms that the set was performed. Incomplete sets are excluded from history and progress. If entered values are still unchecked when you finish, GymNotes asks whether to mark those recorded sets complete first.',
      },
      {
        question: 'How does the rest timer work?',
        answer: 'Choose a rest duration on an exercise during training, or set one in its plan. After a set is successfully marked Done, GymNotes starts the countdown automatically. Tap Start next set when you begin again so actual rest is recorded on the completed set. You can also add 30 seconds or skip rest, and the timer remains accurate after a refresh.',
      },
      {
        question: 'Will the rest alarm always make a sound?',
        answer: 'GymNotes shows a visible Ready alert and also attempts a short sound and vibration. Device silent mode, browser permissions, and hardware support can prevent sound or vibration, so keep the countdown visible when timing is critical.',
      },
      {
        question: 'What is a warm-up set?',
        answer: 'A warm-up prepares you for the exercise but is excluded from working-set and volume statistics by default.',
      },
      {
        question: 'Can I add an exercise during a workout?',
        answer: 'Yes. Use Add an exercise in the live workout. The body preview shows the movement’s primary target before you add it.',
      },
      {
        question: 'Can I resume an unfinished workout?',
        answer: 'Yes. In-progress workouts appear in Train and in the unfinished section of History.',
      },
      {
        question: 'What does abandoning a workout do?',
        answer: 'It ends the session as abandoned instead of completed. Its recorded data remains visible in History, but the status clearly identifies it as abandoned.',
      },
    ],
  },
  {
    id: 'exercises',
    title: 'Exercises and body groups',
    description: 'Understand movements and organize the exercise library.',
    items: [
      {
        question: 'What does the highlighted body area mean?',
        answer: 'It represents the exercise’s primary muscle group. Other muscles may assist, so the highlight is a simple training guide rather than a complete anatomy analysis.',
      },
      {
        question: 'How do I find an exercise for a body part?',
        answer: 'Open Exercises and select a labelled body group or its region on the body guide. The list is filtered to movements with that primary target.',
      },
      {
        question: 'What is the difference between shared and personal exercises?',
        answer: 'Shared exercises are available to everyone. Personal exercises are created by you and are visible only in your account.',
      },
      {
        question: 'What if an exercise is missing?',
        answer: 'Open Add a personal exercise in the Exercises section. Give it a name, primary muscle group, and optional equipment.',
      },
    ],
  },
  {
    id: 'history',
    title: 'History',
    description: 'Review what you actually performed.',
    items: [
      {
        question: 'What is shown in workout history?',
        answer: 'History shows completed and abandoned sessions. Open a workout to inspect its exercises, trained body parts, completed sets, repetitions, weights, and working volume.',
      },
      {
        question: 'How is training volume calculated?',
        answer: 'For every completed working set, GymNotes multiplies weight by repetitions, then adds the results. For example: 6 kg × 8 reps plus 8 kg × 6 reps equals 96 kg volume.',
      },
      {
        question: 'Why is a set missing from volume?',
        answer: 'The set may not have been marked complete, may be a warm-up, or may not contain both weight and repetition values. Those sets are excluded from working volume.',
      },
      {
        question: 'Can I edit a completed workout?',
        answer: 'No. Completed and abandoned workouts are read-only so historical results cannot be changed accidentally.',
      },
    ],
  },
  {
    id: 'progress',
    title: 'Progress',
    description: 'Interpret trends across completed training.',
    items: [
      {
        question: 'What does Volume by muscle group show?',
        answer: 'It adds completed working-set volume for each primary muscle group over the last eight weeks. It helps show how your training is distributed.',
      },
      {
        question: 'What does Exercise progression show?',
        answer: 'It shows session-by-session volume and the heaviest completed working set for a selected exercise.',
      },
      {
        question: 'Why does an exercise have no progress data?',
        answer: 'Progress requires a completed or abandoned workout containing completed, non-warm-up sets with both weight and repetitions.',
      },
      {
        question: 'How does GymNotes identify a personal record?',
        answer: 'After a completed workout, GymNotes compares completed working sets with your earlier completed workouts. It can celebrate your heaviest completed set, more repetitions at the same weight, best single-set volume, and highest workout volume. Your first performance creates a baseline rather than a record.',
      },
      {
        question: 'Does a personal record mean I should lift as heavy as possible?',
        answer: 'No. Records describe measured progress and are not coaching instructions. Controlled technique, an appropriate effort, and gradual progression matter more than chasing a maximum weight.',
      },
      {
        question: 'Are kilograms and pounds mixed together?',
        answer: 'No. GymNotes converts recorded weights to a common unit for calculations and then displays results in the unit selected in Settings.',
      },
    ],
  },
  {
    id: 'account',
    title: 'Account and privacy',
    description: 'Manage display preferences and private data.',
    items: [
      {
        question: 'Who can see my workouts and personal exercises?',
        answer: 'Workout data, plans, and personal exercises are scoped to your signed-in account. Other users cannot open or modify them.',
      },
      {
        question: 'How do I change between kilograms and pounds?',
        answer: 'Open Settings and select your preferred weight unit. Existing workouts keep their original values; GymNotes converts only the display and calculations.',
      },
      {
        question: 'How do I log out?',
        answer: 'Select the exit icon in the top-right application header, beside Settings. You return to the public GymNotes page, and your workout data remains saved for your next sign-in.',
      },
      {
        question: 'What happens if I delete my account?',
        answer: 'In Settings, expand Advanced account actions to find Delete account. Your plans, personal exercises, sessions, sets, and history are permanently deleted. This action cannot be undone.',
      },
    ],
  },
];

export function filterHelpSections(sections, query) {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return sections;

  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter(({ question, answer }) =>
        `${question} ${answer}`.toLocaleLowerCase().includes(needle)
      ),
    }))
    .filter((section) => section.items.length > 0);
}
