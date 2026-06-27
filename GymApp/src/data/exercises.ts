// Static exercise library (no backend / no AI). Names match what the workout
// logger uses so "add to workout" and PR tracking line up.
export type Exercise = {
  name: string;
  muscle: string;       // primary muscle group
  equipment: string;
  cues: string[];       // quick how-to / form tips
};

export const EXERCISES: Exercise[] = [
  { name: 'Bench Press', muscle: 'Chest', equipment: 'Barbell', cues: ['Shoulder blades pinched, slight arch', 'Lower to mid-chest, elbows ~45°', 'Press up and slightly back'] },
  { name: 'Incline Bench', muscle: 'Chest', equipment: 'Barbell', cues: ['Bench at 30–45°', 'Bar to upper chest', 'Keep wrists stacked over elbows'] },
  { name: 'Push-up', muscle: 'Chest', equipment: 'Bodyweight', cues: ['Body in a straight line', 'Hands under shoulders', 'Lower until chest near floor'] },
  { name: 'Squat', muscle: 'Legs', equipment: 'Barbell', cues: ['Brace core, chest up', 'Sit back and down to parallel', 'Drive through mid-foot'] },
  { name: 'Leg Press', muscle: 'Legs', equipment: 'Machine', cues: ['Feet shoulder-width', 'Lower until knees ~90°', "Don't lock knees at top"] },
  { name: 'Lunges', muscle: 'Legs', equipment: 'Dumbbell', cues: ['Step forward, torso upright', 'Back knee toward floor', 'Push through front heel'] },
  { name: 'Romanian Deadlift', muscle: 'Hamstrings', equipment: 'Barbell', cues: ['Soft knees, hinge at hips', 'Bar close to legs', 'Feel hamstring stretch, then drive hips'] },
  { name: 'Deadlift', muscle: 'Back', equipment: 'Barbell', cues: ['Bar over mid-foot', 'Flat back, brace hard', 'Push the floor away'] },
  { name: 'Barbell Row', muscle: 'Back', equipment: 'Barbell', cues: ['Hinge ~45°, flat back', 'Pull to lower ribs', 'Squeeze shoulder blades'] },
  { name: 'Lat Pulldown', muscle: 'Back', equipment: 'Cable', cues: ['Slight lean back', 'Pull bar to upper chest', 'Drive elbows down'] },
  { name: 'Pull-up', muscle: 'Back', equipment: 'Bodyweight', cues: ['Full hang start', 'Chin over bar', 'Control the way down'] },
  { name: 'Overhead Press', muscle: 'Shoulders', equipment: 'Barbell', cues: ['Brace glutes & core', 'Press bar over forehead', 'Lock out overhead'] },
  { name: 'Shoulder Press', muscle: 'Shoulders', equipment: 'Dumbbell', cues: ['Elbows slightly forward', 'Press up, not flaring out', 'Lower with control'] },
  { name: 'Lateral Raise', muscle: 'Shoulders', equipment: 'Dumbbell', cues: ['Slight bend in elbows', 'Raise to shoulder height', 'Lead with the elbows'] },
  { name: 'Bicep Curl', muscle: 'Arms', equipment: 'Dumbbell', cues: ['Elbows pinned to sides', 'Curl without swinging', 'Squeeze at the top'] },
  { name: 'Tricep Pushdown', muscle: 'Arms', equipment: 'Cable', cues: ['Elbows tight to body', 'Extend fully', 'Control back up'] },
  { name: 'Plank', muscle: 'Core', equipment: 'Bodyweight', cues: ['Forearms under shoulders', 'Squeeze glutes & core', 'Flat line head-to-heels'] },
  { name: 'Hanging Leg Raise', muscle: 'Core', equipment: 'Bodyweight', cues: ['No swinging', 'Raise legs to hip height+', 'Lower slowly'] },
];

export const MUSCLES = ['Chest', 'Back', 'Legs', 'Hamstrings', 'Shoulders', 'Arms', 'Core'];
