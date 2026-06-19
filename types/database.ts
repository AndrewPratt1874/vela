export type IssueStatus = 'todo' | 'in_progress' | 'in_review' | 'done' | 'cancelled'
export type IssuePriority = 'low' | 'medium' | 'high' | 'urgent'
export type IssueType = 'bug' | 'feature' | 'task' | 'improvement'
export type TicketStatus = 'open' | 'in_progress' | 'waiting_on_customer' | 'resolved' | 'closed'

export type UserStatus = 'pending' | 'approved' | 'rejected'

export type Profile = {
  id: string
  full_name: string | null
  email: string | null
  avatar_url: string | null
  customer_id: string | null
  is_staff: boolean
  status: UserStatus
  approved_at: string | null
  approved_by: string | null
  created_at: string
}

export type Customer = {
  id: string
  name: string
  slug: string
  logo_url: string | null
  created_at: string
}

export type CustomerDomain = {
  domain: string
  customer_id: string
  created_at: string
}

export type Project = {
  id: string
  name: string
  slug: string
  key: string
  description: string | null
  owner_id: string
  customer_id: string | null
  created_at: string
  updated_at: string
}

export type Issue = {
  id: string
  project_id: string
  number: number
  title: string
  description: string | null
  status: IssueStatus
  priority: IssuePriority
  type: IssueType
  resolution: string | null
  due_date: string | null
  estimate: number | null
  assignee_id: string | null
  reporter_id: string
  source_ticket_id: string | null
  created_at: string
  updated_at: string
}

export type Label = {
  id: string
  project_id: string
  name: string
  color: string
  created_at: string
}

export type IssueLabel = {
  issue_id: string
  label_id: string
}

export type Ticket = {
  id: string
  customer_id: string
  number: number
  subject: string
  body: string | null
  status: TicketStatus
  priority: IssuePriority
  created_by: string
  assigned_to: string | null
  created_at: string
  updated_at: string
}

export type TicketComment = {
  id: string
  ticket_id: string
  author_id: string
  body: string
  created_at: string
}

export type Attachment = {
  id: string
  customer_id: string
  storage_path: string
  file_name: string
  mime_type: string | null
  size_bytes: number | null
  uploaded_by: string
  ticket_id: string | null
  issue_id: string | null
  project_id: string | null
  created_at: string
}

export type Notification = {
  id: string
  user_id: string
  type: string
  title: string
  body: string | null
  ticket_id: string | null
  read: boolean
  created_at: string
}

export type PersonRef = Pick<Profile, 'id' | 'full_name' | 'email' | 'avatar_url'>

export type TicketWithPeople = Ticket & {
  creator: PersonRef | null
  assignee: PersonRef | null
  customer?: Pick<Customer, 'id' | 'name' | 'slug'> | null
}

export type IssueWithPeople = Issue & {
  assignee: PersonRef | null
  reporter: PersonRef | null
  labels?: Label[]
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: Partial<Profile> & { id: string }
        Update: Partial<Profile>
        Relationships: []
      }
      customers: {
        Row: Customer
        Insert: Omit<Customer, 'id' | 'created_at' | 'logo_url'> & { id?: string, logo_url?: string | null }
        Update: Partial<Customer>
        Relationships: []
      }
      customer_domains: {
        Row: CustomerDomain
        Insert: Omit<CustomerDomain, 'created_at'>
        Update: Partial<CustomerDomain>
        Relationships: []
      }
      projects: {
        Row: Project
        Insert: Omit<Project, 'id' | 'created_at' | 'updated_at'> & { id?: string }
        Update: Partial<Project>
        Relationships: []
      }
      project_members: {
        Row: {
          project_id: string
          user_id: string
          role: 'owner' | 'admin' | 'member'
          created_at: string
        }
        Insert: {
          project_id: string
          user_id: string
          role?: 'owner' | 'admin' | 'member'
        }
        Update: Partial<{ role: 'owner' | 'admin' | 'member' }>
        Relationships: []
      }
      issues: {
        Row: Issue
        Insert:
          & Pick<Issue, 'project_id' | 'title' | 'reporter_id'>
          & Partial<Omit<Issue, 'project_id' | 'title' | 'reporter_id' | 'created_at' | 'updated_at'>>
        Update: Partial<Issue>
        Relationships: []
      }
      labels: {
        Row: Label
        Insert: Omit<Label, 'id' | 'created_at'> & { id?: string }
        Update: Partial<Label>
        Relationships: []
      }
      issue_labels: {
        Row: IssueLabel
        Insert: IssueLabel
        Update: Partial<IssueLabel>
        Relationships: []
      }
      tickets: {
        Row: Ticket
        Insert:
          & Pick<Ticket, 'customer_id' | 'subject' | 'created_by'>
          & Partial<Omit<Ticket, 'customer_id' | 'subject' | 'created_by' | 'created_at' | 'updated_at'>>
        Update: Partial<Ticket>
        Relationships: []
      }
      ticket_comments: {
        Row: TicketComment
        Insert: Omit<TicketComment, 'id' | 'created_at'> & { id?: string }
        Update: Partial<TicketComment>
        Relationships: []
      }
      attachments: {
        Row: Attachment
        Insert:
          & Omit<Attachment, 'id' | 'created_at' | 'ticket_id' | 'issue_id' | 'project_id'>
          & { id?: string, ticket_id?: string | null, issue_id?: string | null, project_id?: string | null }
        Update: Partial<Attachment>
        Relationships: []
      }
      notifications: {
        Row: Notification
        Insert: Omit<Notification, 'id' | 'created_at' | 'read'> & { id?: string, read?: boolean }
        Update: Partial<Notification>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      issue_status: IssueStatus
      issue_priority: IssuePriority
      issue_type: IssueType
      ticket_status: TicketStatus
    }
    CompositeTypes: Record<string, never>
  }
}
