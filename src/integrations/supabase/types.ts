export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      brand_footers: {
        Row: {
          brand_id: string
          created_at: string
          footer_type: string | null
          html: string
          id: string
          image_slices: Json | null
          is_primary: boolean | null
          logo_public_id: string | null
          logo_url: string | null
          name: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          footer_type?: string | null
          html: string
          id?: string
          image_slices?: Json | null
          is_primary?: boolean | null
          logo_public_id?: string | null
          logo_url?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          footer_type?: string | null
          html?: string
          id?: string
          image_slices?: Json | null
          is_primary?: boolean | null
          logo_public_id?: string | null
          logo_url?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_footers_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_link_index: {
        Row: {
          brand_id: string
          created_at: string | null
          description: string | null
          embedding: string | null
          id: string
          is_healthy: boolean | null
          last_used_at: string | null
          last_verified_at: string | null
          link_type: string
          parent_collection_url: string | null
          source: string
          title: string | null
          updated_at: string | null
          url: string
          use_count: number | null
          user_confirmed: boolean | null
          verification_failures: number | null
        }
        Insert: {
          brand_id: string
          created_at?: string | null
          description?: string | null
          embedding?: string | null
          id?: string
          is_healthy?: boolean | null
          last_used_at?: string | null
          last_verified_at?: string | null
          link_type: string
          parent_collection_url?: string | null
          source: string
          title?: string | null
          updated_at?: string | null
          url: string
          use_count?: number | null
          user_confirmed?: boolean | null
          verification_failures?: number | null
        }
        Update: {
          brand_id?: string
          created_at?: string | null
          description?: string | null
          embedding?: string | null
          id?: string
          is_healthy?: boolean | null
          last_used_at?: string | null
          last_verified_at?: string | null
          link_type?: string
          parent_collection_url?: string | null
          source?: string
          title?: string | null
          updated_at?: string | null
          url?: string
          use_count?: number | null
          user_confirmed?: boolean | null
          verification_failures?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_link_index_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          accent_color: string | null
          all_links: Json
          background_color: string | null
          clickup_api_key: string | null
          clickup_list_id: string | null
          clickup_workspace_id: string | null
          copy_examples: Json | null
          created_at: string
          dark_logo_public_id: string | null
          dark_logo_url: string | null
          domain: string
          footer_configured: boolean | null
          footer_html: string | null
          footer_logo_public_id: string | null
          footer_logo_url: string | null
          html_formatting_rules: Json | null
          id: string
          klaviyo_api_key: string | null
          light_logo_public_id: string | null
          light_logo_url: string | null
          link_color: string | null
          link_preferences: Json | null
          name: string
          primary_color: string
          secondary_color: string
          social_icons: Json | null
          social_links: Json
          text_primary_color: string | null
          typography: Json | null
          updated_at: string
          user_id: string | null
          website_url: string | null
        }
        Insert: {
          accent_color?: string | null
          all_links?: Json
          background_color?: string | null
          clickup_api_key?: string | null
          clickup_list_id?: string | null
          clickup_workspace_id?: string | null
          copy_examples?: Json | null
          created_at?: string
          dark_logo_public_id?: string | null
          dark_logo_url?: string | null
          domain: string
          footer_configured?: boolean | null
          footer_html?: string | null
          footer_logo_public_id?: string | null
          footer_logo_url?: string | null
          html_formatting_rules?: Json | null
          id?: string
          klaviyo_api_key?: string | null
          light_logo_public_id?: string | null
          light_logo_url?: string | null
          link_color?: string | null
          link_preferences?: Json | null
          name: string
          primary_color?: string
          secondary_color?: string
          social_icons?: Json | null
          social_links?: Json
          text_primary_color?: string | null
          typography?: Json | null
          updated_at?: string
          user_id?: string | null
          website_url?: string | null
        }
        Update: {
          accent_color?: string | null
          all_links?: Json
          background_color?: string | null
          clickup_api_key?: string | null
          clickup_list_id?: string | null
          clickup_workspace_id?: string | null
          copy_examples?: Json | null
          created_at?: string
          dark_logo_public_id?: string | null
          dark_logo_url?: string | null
          domain?: string
          footer_configured?: boolean | null
          footer_html?: string | null
          footer_logo_public_id?: string | null
          footer_logo_url?: string | null
          html_formatting_rules?: Json | null
          id?: string
          klaviyo_api_key?: string | null
          light_logo_public_id?: string | null
          light_logo_url?: string | null
          link_color?: string | null
          link_preferences?: Json | null
          name?: string
          primary_color?: string
          secondary_color?: string
          social_icons?: Json | null
          social_links?: Json
          text_primary_color?: string | null
          typography?: Json | null
          updated_at?: string
          user_id?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      campaign_queue: {
        Row: {
          actual_image_height: number | null
          actual_image_width: number | null
          brand_id: string | null
          clickup_task_id: string | null
          clickup_task_url: string | null
          cloudinary_public_id: string | null
          copy_source: string | null
          created_at: string | null
          error_message: string | null
          footer_start_percent: number | null
          generated_preview_texts: Json | null
          generated_subject_lines: Json | null
          id: string
          image_height: number | null
          image_url: string | null
          image_width: number | null
          klaviyo_campaign_id: string | null
          klaviyo_campaign_url: string | null
          klaviyo_template_id: string | null
          name: string | null
          processing_completed_at: string | null
          processing_percent: number | null
          processing_step: string | null
          provided_preview_text: string | null
          provided_subject_line: string | null
          qa_flags: Json | null
          retry_count: number | null
          retry_from_step: string | null
          selected_preview_text: string | null
          selected_segment_preset_id: string | null
          selected_subject_line: string | null
          sent_to_klaviyo_at: string | null
          slices: Json | null
          source: string
          source_metadata: Json | null
          source_url: string | null
          spelling_errors: Json | null
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          actual_image_height?: number | null
          actual_image_width?: number | null
          brand_id?: string | null
          clickup_task_id?: string | null
          clickup_task_url?: string | null
          cloudinary_public_id?: string | null
          copy_source?: string | null
          created_at?: string | null
          error_message?: string | null
          footer_start_percent?: number | null
          generated_preview_texts?: Json | null
          generated_subject_lines?: Json | null
          id?: string
          image_height?: number | null
          image_url?: string | null
          image_width?: number | null
          klaviyo_campaign_id?: string | null
          klaviyo_campaign_url?: string | null
          klaviyo_template_id?: string | null
          name?: string | null
          processing_completed_at?: string | null
          processing_percent?: number | null
          processing_step?: string | null
          provided_preview_text?: string | null
          provided_subject_line?: string | null
          qa_flags?: Json | null
          retry_count?: number | null
          retry_from_step?: string | null
          selected_preview_text?: string | null
          selected_segment_preset_id?: string | null
          selected_subject_line?: string | null
          sent_to_klaviyo_at?: string | null
          slices?: Json | null
          source: string
          source_metadata?: Json | null
          source_url?: string | null
          spelling_errors?: Json | null
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          actual_image_height?: number | null
          actual_image_width?: number | null
          brand_id?: string | null
          clickup_task_id?: string | null
          clickup_task_url?: string | null
          cloudinary_public_id?: string | null
          copy_source?: string | null
          created_at?: string | null
          error_message?: string | null
          footer_start_percent?: number | null
          generated_preview_texts?: Json | null
          generated_subject_lines?: Json | null
          id?: string
          image_height?: number | null
          image_url?: string | null
          image_width?: number | null
          klaviyo_campaign_id?: string | null
          klaviyo_campaign_url?: string | null
          klaviyo_template_id?: string | null
          name?: string | null
          processing_completed_at?: string | null
          processing_percent?: number | null
          processing_step?: string | null
          provided_preview_text?: string | null
          provided_subject_line?: string | null
          qa_flags?: Json | null
          retry_count?: number | null
          retry_from_step?: string | null
          selected_preview_text?: string | null
          selected_segment_preset_id?: string | null
          selected_subject_line?: string | null
          sent_to_klaviyo_at?: string | null
          slices?: Json | null
          source?: string
          source_metadata?: Json | null
          source_url?: string | null
          spelling_errors?: Json | null
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_queue_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_queue_selected_segment_preset_id_fkey"
            columns: ["selected_segment_preset_id"]
            isOneToOne: false
            referencedRelation: "segment_presets"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          blocks: Json | null
          brand_id: string
          created_at: string
          generated_copy: Json | null
          generated_html: string | null
          id: string
          klaviyo_template_id: string | null
          name: string
          original_image_url: string | null
          status: string
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: {
          blocks?: Json | null
          brand_id: string
          created_at?: string
          generated_copy?: Json | null
          generated_html?: string | null
          id?: string
          klaviyo_template_id?: string | null
          name: string
          original_image_url?: string | null
          status?: string
          thumbnail_url?: string | null
          updated_at?: string
        }
        Update: {
          blocks?: Json | null
          brand_id?: string
          created_at?: string
          generated_copy?: Json | null
          generated_html?: string | null
          id?: string
          klaviyo_template_id?: string | null
          name?: string
          original_image_url?: string | null
          status?: string
          thumbnail_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      early_generated_copy: {
        Row: {
          brand_id: string | null
          created_at: string | null
          expires_at: string | null
          id: string
          image_url: string | null
          preview_texts: Json | null
          session_key: string
          spelling_errors: Json | null
          subject_lines: Json | null
        }
        Insert: {
          brand_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          image_url?: string | null
          preview_texts?: Json | null
          session_key: string
          spelling_errors?: Json | null
          subject_lines?: Json | null
        }
        Update: {
          brand_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          image_url?: string | null
          preview_texts?: Json | null
          session_key?: string
          spelling_errors?: Json | null
          subject_lines?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "early_generated_copy_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      early_spelling_check: {
        Row: {
          created_at: string | null
          expires_at: string | null
          has_errors: boolean | null
          id: string
          image_url: string | null
          session_key: string
          spelling_errors: Json | null
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          has_errors?: boolean | null
          id?: string
          image_url?: string | null
          session_key: string
          spelling_errors?: Json | null
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          has_errors?: boolean | null
          id?: string
          image_url?: string | null
          session_key?: string
          spelling_errors?: Json | null
        }
        Relationships: []
      }
      footer_editor_sessions: {
        Row: {
          brand_id: string
          conversation_history: Json
          created_at: string
          current_html: string
          figma_design_data: Json | null
          footer_name: string | null
          id: string
          reference_image_url: string
          updated_at: string
          user_id: string
          vision_data: Json | null
        }
        Insert: {
          brand_id: string
          conversation_history?: Json
          created_at?: string
          current_html: string
          figma_design_data?: Json | null
          footer_name?: string | null
          id?: string
          reference_image_url: string
          updated_at?: string
          user_id: string
          vision_data?: Json | null
        }
        Update: {
          brand_id?: string
          conversation_history?: Json
          created_at?: string
          current_html?: string
          figma_design_data?: Json | null
          footer_name?: string | null
          id?: string
          reference_image_url?: string
          updated_at?: string
          user_id?: string
          vision_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "footer_editor_sessions_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      plugin_tokens: {
        Row: {
          created_at: string | null
          id: string
          last_used_at: string | null
          name: string | null
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          last_used_at?: string | null
          name?: string | null
          token?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          last_used_at?: string | null
          name?: string | null
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          clickup_api_key: string | null
          clickup_workspace_id: string | null
          created_at: string | null
          email: string | null
          figma_access_token: string | null
          id: string
          queue_column_widths: Json | null
          queue_zoom_level: number | null
          updated_at: string | null
        }
        Insert: {
          clickup_api_key?: string | null
          clickup_workspace_id?: string | null
          created_at?: string | null
          email?: string | null
          figma_access_token?: string | null
          id: string
          queue_column_widths?: Json | null
          queue_zoom_level?: number | null
          updated_at?: string | null
        }
        Update: {
          clickup_api_key?: string | null
          clickup_workspace_id?: string | null
          created_at?: string | null
          email?: string | null
          figma_access_token?: string | null
          id?: string
          queue_column_widths?: Json | null
          queue_zoom_level?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      segment_presets: {
        Row: {
          brand_id: string
          created_at: string
          description: string | null
          excluded_segments: Json
          id: string
          included_segments: Json
          is_default: boolean
          name: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          description?: string | null
          excluded_segments?: Json
          id?: string
          included_segments?: Json
          is_default?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          description?: string | null
          excluded_segments?: Json
          id?: string
          included_segments?: Json
          is_default?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "segment_presets_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      sitemap_import_jobs: {
        Row: {
          brand_id: string
          collection_urls_count: number | null
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          id: string
          product_urls_count: number | null
          sitemap_url: string
          started_at: string | null
          status: string
          updated_at: string | null
          urls_failed: number | null
          urls_found: number | null
          urls_processed: number | null
        }
        Insert: {
          brand_id: string
          collection_urls_count?: number | null
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          product_urls_count?: number | null
          sitemap_url: string
          started_at?: string | null
          status?: string
          updated_at?: string | null
          urls_failed?: number | null
          urls_found?: number | null
          urls_processed?: number | null
        }
        Update: {
          brand_id?: string
          collection_urls_count?: number | null
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          product_urls_count?: number | null
          sitemap_url?: string
          started_at?: string | null
          status?: string
          updated_at?: string | null
          urls_failed?: number | null
          urls_found?: number | null
          urls_processed?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sitemap_import_jobs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      match_brand_links: {
        Args: {
          match_brand_id: string
          match_count?: number
          query_embedding: string
        }
        Returns: {
          id: string
          link_type: string
          similarity: number
          title: string
          url: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
