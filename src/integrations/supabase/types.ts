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
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      attachments: {
        Row: {
          created_at: string | null
          file_name: string
          id: string
          report_id: string | null
          storage_path: string
          tag: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string | null
          file_name: string
          id?: string
          report_id?: string | null
          storage_path: string
          tag: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string | null
          file_name?: string
          id?: string
          report_id?: string | null
          storage_path?: string
          tag?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attachments_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          author_id: string | null
          body: string
          created_at: string | null
          id: string
          report_id: string | null
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string | null
          id?: string
          report_id?: string | null
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string | null
          id?: string
          report_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          department: string | null
          email: string
          full_name: string
          id: string
          role: string
        }
        Insert: {
          created_at?: string | null
          department?: string | null
          email: string
          full_name: string
          id: string
          role: string
        }
        Update: {
          created_at?: string | null
          department?: string | null
          email?: string
          full_name?: string
          id?: string
          role?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          assigned_to: string | null
          category: string
          closed_at: string | null
          closed_by: string | null
          closure_comments: string | null
          created_at: string | null
          description: string
          due_at: string | null
          id: string
          is_anonymous: boolean | null
          last_reminder_sent_at: string | null
          overdue: boolean | null
          overdue_notified_at: string | null
          reference_number: string
          reporter_email: string | null
          reporter_id: string | null
          reporter_name: string | null
          resolution: string | null
          severity: string
          status: string
          updated_at: string | null
          zone: string
        }
        Insert: {
          assigned_to?: string | null
          category: string
          closed_at?: string | null
          closed_by?: string | null
          closure_comments?: string | null
          created_at?: string | null
          description: string
          due_at?: string | null
          id?: string
          is_anonymous?: boolean | null
          last_reminder_sent_at?: string | null
          overdue?: boolean | null
          overdue_notified_at?: string | null
          reference_number?: string
          reporter_email?: string | null
          reporter_id?: string | null
          reporter_name?: string | null
          resolution?: string | null
          severity: string
          status?: string
          updated_at?: string | null
          zone: string
        }
        Update: {
          assigned_to?: string | null
          category?: string
          closed_at?: string | null
          closed_by?: string | null
          closure_comments?: string | null
          created_at?: string | null
          description?: string
          due_at?: string | null
          id?: string
          is_anonymous?: boolean | null
          last_reminder_sent_at?: string | null
          overdue?: boolean | null
          overdue_notified_at?: string | null
          reference_number?: string
          reporter_email?: string | null
          reporter_id?: string | null
          reporter_name?: string | null
          resolution?: string | null
          severity?: string
          status?: string
          updated_at?: string | null
          zone?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sites: {
        Row: {
          created_at: string | null
          id: string
          name: string
          supervisor_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          supervisor_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          supervisor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sites_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_rules: {
        Row: {
          resolution_hours: number
          response_hours: number
          severity: string
        }
        Insert: {
          resolution_hours: number
          response_hours: number
          severity: string
        }
        Update: {
          resolution_hours?: number
          response_hours?: number
          severity?: string
        }
        Relationships: []
      }
      status_log: {
        Row: {
          changed_at: string | null
          changed_by: string | null
          id: string
          new_status: string
          old_status: string | null
          report_id: string | null
        }
        Insert: {
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          new_status: string
          old_status?: string | null
          report_id?: string | null
        }
        Update: {
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          new_status?: string
          old_status?: string | null
          report_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "status_log_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "status_log_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_reports_needing_overdue_notice: {
        Args: never
        Returns: {
          category: string
          due_at: string
          reference_number: string
          report_id: string
          supervisor_email: string
          supervisor_id: string
          supervisor_name: string
          zone: string
        }[]
      }
      get_user_role: { Args: never; Returns: string }
      refresh_overdue_flags: { Args: never; Returns: undefined }
      submit_public_report: {
        Args: {
          p_category: string
          p_description: string
          p_is_anonymous: boolean
          p_reporter_email: string
          p_reporter_name: string
          p_severity: string
          p_zone: string
        }
        Returns: {
          id: string
          reference_number: string
        }[]
      }
      update_report_workflow: {
        Args: {
          p_closure_comments?: string
          p_report_id: string
          p_resolution?: string
          p_status: string
        }
        Returns: {
          assigned_to: string | null
          category: string
          closed_at: string | null
          closed_by: string | null
          closure_comments: string | null
          created_at: string | null
          description: string
          due_at: string | null
          id: string
          is_anonymous: boolean | null
          last_reminder_sent_at: string | null
          overdue: boolean | null
          overdue_notified_at: string | null
          reference_number: string
          reporter_email: string | null
          reporter_id: string | null
          reporter_name: string | null
          resolution: string | null
          severity: string
          status: string
          updated_at: string | null
          zone: string
        }
        SetofOptions: {
          from: "*"
          to: "reports"
          isOneToOne: true
          isSetofReturn: false
        }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
