import type { IssuePriority, IssueStatus, IssueType } from '~/types/database'

type Color = 'neutral' | 'info' | 'primary' | 'success' | 'warning' | 'error'

export interface StatusMeta {
  value: IssueStatus
  label: string
  icon: string
  color: Color
}

export interface PriorityMeta {
  value: IssuePriority
  label: string
  icon: string
  color: Color
}

export interface TypeMeta {
  value: IssueType
  label: string
  icon: string
  color: Color
}

export const ISSUE_STATUSES: StatusMeta[] = [
  { value: 'todo', label: 'Todo', icon: 'i-lucide-circle', color: 'neutral' },
  { value: 'in_progress', label: 'In progress', icon: 'i-lucide-circle-dashed', color: 'info' },
  { value: 'in_review', label: 'In review', icon: 'i-lucide-eye', color: 'primary' },
  { value: 'done', label: 'Done', icon: 'i-lucide-circle-check', color: 'success' },
  { value: 'cancelled', label: 'Cancelled', icon: 'i-lucide-circle-x', color: 'neutral' },
]

export const ISSUE_PRIORITIES: PriorityMeta[] = [
  { value: 'low', label: 'Low', icon: 'i-lucide-chevron-down', color: 'neutral' },
  { value: 'medium', label: 'Medium', icon: 'i-lucide-equal', color: 'info' },
  { value: 'high', label: 'High', icon: 'i-lucide-chevron-up', color: 'warning' },
  { value: 'urgent', label: 'Urgent', icon: 'i-lucide-alert-triangle', color: 'error' },
]

export const ISSUE_TYPES: TypeMeta[] = [
  { value: 'bug', label: 'Bug', icon: 'i-lucide-bug', color: 'error' },
  { value: 'feature', label: 'Feature', icon: 'i-lucide-sparkles', color: 'primary' },
  { value: 'task', label: 'Task', icon: 'i-lucide-square-check-big', color: 'info' },
  { value: 'improvement', label: 'Improvement', icon: 'i-lucide-trending-up', color: 'success' },
]

// Tailwind-safe palette for user-created labels (maps to Nuxt UI colors)
export const LABEL_COLORS = ['neutral', 'info', 'primary', 'success', 'warning', 'error'] as const

export function useIssueMeta() {
  const statusMap = Object.fromEntries(ISSUE_STATUSES.map((s) => [s.value, s])) as Record<IssueStatus, StatusMeta>
  const priorityMap = Object.fromEntries(ISSUE_PRIORITIES.map((p) => [p.value, p])) as Record<IssuePriority, PriorityMeta>
  const typeMap = Object.fromEntries(ISSUE_TYPES.map((t) => [t.value, t])) as Record<IssueType, TypeMeta>
  return { ISSUE_STATUSES, ISSUE_PRIORITIES, ISSUE_TYPES, statusMap, priorityMap, typeMap }
}
