export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      brands: {
        Row: {
          id: string
          name: string
          invoice_email: string | null
          invoice_instructions: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          invoice_email?: string | null
          invoice_instructions?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          invoice_email?: string | null
          invoice_instructions?: string | null
          created_at?: string
        }
        Relationships: []
      }
      influencers: {
        Row: {
          id: string
          name: string
          handle: string | null
          email: string | null
          platform: string | null
          content_type: string | null
          location: string | null
          rate: number | null
          follower_count: number | null
          notes: string | null
          performance_rating: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          handle?: string | null
          email?: string | null
          platform?: string | null
          content_type?: string | null
          location?: string | null
          rate?: number | null
          follower_count?: number | null
          notes?: string | null
          performance_rating?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          handle?: string | null
          email?: string | null
          platform?: string | null
          content_type?: string | null
          location?: string | null
          rate?: number | null
          follower_count?: number | null
          notes?: string | null
          performance_rating?: number | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      campaigns: {
        Row: {
          id: string
          brand_id: string
          retailer: string | null
          region: string | null
          name: string
          quarter: string | null
          products: string | null
          budget: number | null
          posting_deadline: string | null
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          brand_id: string
          retailer?: string | null
          region?: string | null
          name: string
          quarter?: string | null
          products?: string | null
          budget?: number | null
          posting_deadline?: string | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          brand_id?: string
          retailer?: string | null
          region?: string | null
          name?: string
          quarter?: string | null
          products?: string | null
          budget?: number | null
          posting_deadline?: string | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'campaigns_brand_id_fkey'
            columns: ['brand_id']
            isOneToOne: false
            referencedRelation: 'brands'
            referencedColumns: ['id']
          },
        ]
      }
      campaign_influencers: {
        Row: {
          id: string
          campaign_id: string
          influencer_id: string
          pipeline_stage: string
          deliverable: string | null
          w9_status: string
          invoice_status: string
          payment_status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          campaign_id: string
          influencer_id: string
          pipeline_stage?: string
          deliverable?: string | null
          w9_status?: string
          invoice_status?: string
          payment_status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          campaign_id?: string
          influencer_id?: string
          pipeline_stage?: string
          deliverable?: string | null
          w9_status?: string
          invoice_status?: string
          payment_status?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'campaign_influencers_campaign_id_fkey'
            columns: ['campaign_id']
            isOneToOne: false
            referencedRelation: 'campaigns'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'campaign_influencers_influencer_id_fkey'
            columns: ['influencer_id']
            isOneToOne: false
            referencedRelation: 'influencers'
            referencedColumns: ['id']
          },
        ]
      }
      payments: {
        Row: {
          id: string
          campaign_influencer_id: string
          amount: number | null
          date_sent: string | null
          method: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          campaign_influencer_id: string
          amount?: number | null
          date_sent?: string | null
          method?: string | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          campaign_influencer_id?: string
          amount?: number | null
          date_sent?: string | null
          method?: string | null
          notes?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'payments_campaign_influencer_id_fkey'
            columns: ['campaign_influencer_id']
            isOneToOne: false
            referencedRelation: 'campaign_influencers'
            referencedColumns: ['id']
          },
        ]
      }
      documents: {
        Row: {
          id: string
          campaign_influencer_id: string
          type: string
          file_url: string | null
          uploaded_at: string
        }
        Insert: {
          id?: string
          campaign_influencer_id: string
          type: string
          file_url?: string | null
          uploaded_at?: string
        }
        Update: {
          id?: string
          campaign_influencer_id?: string
          type?: string
          file_url?: string | null
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'documents_campaign_influencer_id_fkey'
            columns: ['campaign_influencer_id']
            isOneToOne: false
            referencedRelation: 'campaign_influencers'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// Convenience type helpers
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']
export type InsertTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']
export type UpdateTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']
