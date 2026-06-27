// Ready-made workout routines members can load into the logger with one tap.
export type TemplateSet = { exercise: string; sets: number; reps: string };
export type Template = { name: string; emoji: string; focus: string; sets: TemplateSet[] };

export const TEMPLATES: Template[] = [
  {
    name: 'Push Day', emoji: '🟠', focus: 'Chest · Shoulders · Triceps',
    sets: [
      { exercise: 'Bench Press', sets: 4, reps: '8' },
      { exercise: 'Incline Bench', sets: 3, reps: '10' },
      { exercise: 'Shoulder Press', sets: 3, reps: '10' },
      { exercise: 'Lateral Raise', sets: 3, reps: '15' },
      { exercise: 'Tricep Pushdown', sets: 3, reps: '12' },
    ],
  },
  {
    name: 'Pull Day', emoji: '🔵', focus: 'Back · Biceps',
    sets: [
      { exercise: 'Deadlift', sets: 3, reps: '5' },
      { exercise: 'Pull-up', sets: 3, reps: '8' },
      { exercise: 'Barbell Row', sets: 3, reps: '10' },
      { exercise: 'Lat Pulldown', sets: 3, reps: '12' },
      { exercise: 'Bicep Curl', sets: 3, reps: '12' },
    ],
  },
  {
    name: 'Leg Day', emoji: '🟢', focus: 'Quads · Hamstrings · Glutes',
    sets: [
      { exercise: 'Squat', sets: 4, reps: '8' },
      { exercise: 'Romanian Deadlift', sets: 3, reps: '10' },
      { exercise: 'Leg Press', sets: 3, reps: '12' },
      { exercise: 'Lunges', sets: 3, reps: '12' },
    ],
  },
  {
    name: 'Full Body', emoji: '⚡', focus: 'Whole body — great for beginners',
    sets: [
      { exercise: 'Squat', sets: 3, reps: '8' },
      { exercise: 'Bench Press', sets: 3, reps: '8' },
      { exercise: 'Barbell Row', sets: 3, reps: '10' },
      { exercise: 'Shoulder Press', sets: 3, reps: '10' },
      { exercise: 'Plank', sets: 3, reps: '45s' },
    ],
  },
  {
    name: 'Upper Body', emoji: '💪', focus: 'Chest · Back · Shoulders · Arms',
    sets: [
      { exercise: 'Bench Press', sets: 4, reps: '8' },
      { exercise: 'Barbell Row', sets: 4, reps: '8' },
      { exercise: 'Overhead Press', sets: 3, reps: '10' },
      { exercise: 'Bicep Curl', sets: 3, reps: '12' },
      { exercise: 'Tricep Pushdown', sets: 3, reps: '12' },
    ],
  },
];
