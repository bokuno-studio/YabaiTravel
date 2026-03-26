export interface UserProfile {
  id: string
  display_name: string | null
  avatar_url: string | null
  membership: 'free' | 'supporter'
  role: 'user' | 'admin'
  square_customer_id?: string | null
  square_subscription_id?: string | null
  membership_expires_at?: string | null
  created_at?: string
  updated_at?: string
}
