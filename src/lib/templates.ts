import type { PlanConfig } from './types'
import { DEFAULT_SPORTS } from './types'

const [swim, bike, run, strength] = DEFAULT_SPORTS

export interface Template {
  id: string
  name: string
  description: string
  icon: string
  config: Omit<PlanConfig, 'weekStartDate' | 'preferredStartTimes'>
}

export const TEMPLATES: Template[] = [
  {
    id: 'beginner-tri',
    name: 'Beginner Triathlete',
    description: 'Getting started with three disciplines',
    icon: '🏊',
    config: {
      sports: [swim, bike, run],
      focus: 'run',
      weekIntensity: 'light',
      dailyMinutes: [45, 0, 60, 0, 45, 90, 0],
      targets: {
        swim: { sessionsPerWeek: 2 },
        bike: { sessionsPerWeek: 1 },
        run:  { sessionsPerWeek: 2 },
      },
    },
  },
  {
    id: 'runner',
    name: 'Runner',
    description: 'Run-focused with strength support',
    icon: '🏃',
    config: {
      sports: [run, strength],
      focus: 'run',
      weekIntensity: 'moderate',
      dailyMinutes: [60, 0, 60, 45, 0, 90, 45],
      targets: {
        run:      { sessionsPerWeek: 4 },
        strength: { sessionsPerWeek: 2 },
      },
    },
  },
  {
    id: 'cyclist',
    name: 'Cyclist',
    description: 'Bike-focused with strength work',
    icon: '🚴',
    config: {
      sports: [bike, strength],
      focus: 'bike',
      weekIntensity: 'moderate',
      dailyMinutes: [0, 90, 0, 60, 0, 150, 60],
      targets: {
        bike:     { sessionsPerWeek: 3 },
        strength: { sessionsPerWeek: 2 },
      },
    },
  },
  {
    id: 'swimmer',
    name: 'Swimmer',
    description: 'Pool-focused training',
    icon: '🏊',
    config: {
      sports: [swim, strength],
      focus: 'swim',
      weekIntensity: 'moderate',
      dailyMinutes: [60, 0, 75, 0, 60, 0, 75],
      targets: {
        swim:     { sessionsPerWeek: 4 },
        strength: { sessionsPerWeek: 1 },
      },
    },
  },
  {
    id: 'gym',
    name: 'Gym / Strength',
    description: 'Strength focus with cardio',
    icon: '💪',
    config: {
      sports: [strength, run],
      focus: 'strength',
      weekIntensity: 'moderate',
      dailyMinutes: [60, 60, 0, 60, 60, 90, 0],
      targets: {
        strength: { sessionsPerWeek: 4 },
        run:      { sessionsPerWeek: 2 },
      },
    },
  },
  {
    id: 'elite-tri',
    name: 'Elite Triathlete',
    description: 'High-volume three-sport training',
    icon: '🏆',
    config: {
      sports: DEFAULT_SPORTS,
      focus: 'run',
      weekIntensity: 'hard',
      dailyMinutes: [90, 120, 90, 120, 60, 180, 90],
      targets: {
        swim:     { sessionsPerWeek: 3 },
        bike:     { sessionsPerWeek: 3 },
        run:      { sessionsPerWeek: 4 },
        strength: { sessionsPerWeek: 2 },
      },
    },
  },
]
