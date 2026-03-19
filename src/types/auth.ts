export interface UserProfile {
  id: string
  display_name: string | null
  avatar_url: string | null
  membership: 'free' | 'supporter'
  stripe_customer_id?: string | null
  stripe_subscription_id?: string | null
  square_customer_id?: string | null
  membership_expires_at?: string | null
  created_at?: string
  updated_at?: string
}
