/**
 * A bundled list of common activities with MET (metabolic equivalent)
 * values, for estimating exercise calories without any API.
 *
 *   kcal ≈ MET × body-weight-kg × hours
 *
 * MET values are approximations from the standard Compendium of Physical
 * Activities — good enough for a calorie-tracking estimate the user can
 * always override.
 */

export interface Activity {
  name: string;
  met: number;
}

export const ACTIVITIES: Activity[] = [
  // Walking & running
  { name: 'Walking, slow', met: 2.8 },
  { name: 'Walking, brisk', met: 4.3 },
  { name: 'Walking, uphill', met: 6.0 },
  { name: 'Walking the dog', met: 3.0 },
  { name: 'Hiking', met: 6.0 },
  { name: 'Jogging', met: 7.0 },
  { name: 'Running, moderate', met: 9.8 },
  { name: 'Running, fast', met: 11.8 },
  { name: 'Treadmill, incline walk', met: 6.0 },
  { name: 'Stair climbing', met: 8.0 },
  // Cycling
  { name: 'Cycling, leisurely', met: 4.0 },
  { name: 'Cycling, moderate', met: 8.0 },
  { name: 'Cycling, vigorous', met: 10.0 },
  { name: 'Spin class', met: 8.5 },
  // Gym & strength
  { name: 'Weight training, light', met: 3.5 },
  { name: 'Weight training, vigorous', met: 6.0 },
  { name: 'Circuit training', met: 8.0 },
  { name: 'HIIT', met: 8.0 },
  { name: 'Kettlebell workout', met: 9.8 },
  { name: 'Calisthenics, light', met: 3.8 },
  { name: 'Calisthenics, vigorous', met: 8.0 },
  { name: 'Elliptical trainer', met: 5.0 },
  { name: 'Rowing machine, moderate', met: 7.0 },
  { name: 'Rowing machine, vigorous', met: 8.5 },
  { name: 'Stair machine', met: 9.0 },
  { name: 'Aerobics, low impact', met: 5.0 },
  { name: 'Aerobics, high impact', met: 7.3 },
  // Mind & body
  { name: 'Yoga', met: 3.0 },
  { name: 'Pilates', met: 3.0 },
  { name: 'Stretching', met: 2.3 },
  { name: 'Tai chi', met: 3.0 },
  // Water
  { name: 'Swimming, leisurely', met: 6.0 },
  { name: 'Swimming, laps', met: 8.3 },
  { name: 'Swimming, vigorous', met: 10.0 },
  { name: 'Water aerobics', met: 5.5 },
  { name: 'Kayaking', met: 5.0 },
  { name: 'Paddleboarding', met: 6.0 },
  { name: 'Surfing', met: 3.0 },
  // Sports
  { name: 'Football (soccer)', met: 7.0 },
  { name: 'Basketball', met: 6.5 },
  { name: 'Tennis', met: 7.3 },
  { name: 'Badminton', met: 5.5 },
  { name: 'Table tennis', met: 4.0 },
  { name: 'Squash', met: 7.3 },
  { name: 'Volleyball', met: 4.0 },
  { name: 'Golf, walking', met: 4.8 },
  { name: 'Bowling', met: 3.8 },
  { name: 'Cricket', met: 4.8 },
  { name: 'Rugby', met: 8.3 },
  { name: 'Boxing', met: 7.8 },
  { name: 'Martial arts', met: 10.0 },
  { name: 'Climbing / bouldering', met: 8.0 },
  { name: 'Skiing', met: 7.0 },
  { name: 'Snowboarding', met: 5.3 },
  { name: 'Ice skating', met: 7.0 },
  { name: 'Skateboarding', met: 5.0 },
  { name: 'Horse riding', met: 5.5 },
  // Cardio extras
  { name: 'Jump rope', met: 12.3 },
  { name: 'Dancing', met: 5.0 },
  { name: 'Dancing, fast', met: 7.8 },
  { name: 'Trampoline', met: 3.5 },
  // Home & daily
  { name: 'Gardening', met: 3.8 },
  { name: 'Mowing the lawn', met: 5.0 },
  { name: 'House cleaning', met: 3.3 },
  { name: 'Vacuuming', met: 3.3 },
  { name: 'Moving furniture', met: 5.8 },
  { name: 'Playing with kids', met: 3.5 },
  { name: 'Shoveling snow', met: 5.3 },
  { name: 'DIY / home repair', met: 3.5 },
];

/** Default body weight (kg) when the profile has none set. */
export const DEFAULT_WEIGHT_KG = 70;

/** kcal burned ≈ MET × body-weight-kg × hours. */
export function estimateActivityKcal(
  met: number,
  weightKg: number,
  minutes: number,
): number {
  const w = weightKg > 0 ? weightKg : DEFAULT_WEIGHT_KG;
  return met * w * (minutes / 60);
}
