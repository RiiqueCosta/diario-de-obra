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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      activities: {
        Row: {
          actual_end_date: string | null
          actual_start_date: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          location: string | null
          notes: string | null
          planned_end_date: string | null
          planned_quantity: number | null
          planned_start_date: string | null
          priority: Database["public"]["Enums"]["priority_level"]
          progress_percentage: number
          project_id: string
          responsible_user_id: string | null
          row_version: number
          stage_id: string | null
          status: Database["public"]["Enums"]["activity_status"]
          title: string
          unit: string | null
          updated_at: string
          weight: number
        }
        Insert: {
          actual_end_date?: string | null
          actual_start_date?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          planned_end_date?: string | null
          planned_quantity?: number | null
          planned_start_date?: string | null
          priority?: Database["public"]["Enums"]["priority_level"]
          progress_percentage?: number
          project_id: string
          responsible_user_id?: string | null
          row_version?: number
          stage_id?: string | null
          status?: Database["public"]["Enums"]["activity_status"]
          title: string
          unit?: string | null
          updated_at?: string
          weight?: number
        }
        Update: {
          actual_end_date?: string | null
          actual_start_date?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          planned_end_date?: string | null
          planned_quantity?: number | null
          planned_start_date?: string | null
          priority?: Database["public"]["Enums"]["priority_level"]
          progress_percentage?: number
          project_id?: string
          responsible_user_id?: string | null
          row_version?: number
          stage_id?: string | null
          status?: Database["public"]["Enums"]["activity_status"]
          title?: string
          unit?: string | null
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "activities_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_responsible_user_id_fkey"
            columns: ["responsible_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "project_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_dependencies: {
        Row: {
          activity_id: string
          created_at: string
          depends_on_id: string
        }
        Insert: {
          activity_id: string
          created_at?: string
          depends_on_id: string
        }
        Update: {
          activity_id?: string
          created_at?: string
          depends_on_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_dependencies_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_dependencies_depends_on_id_fkey"
            columns: ["depends_on_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
        ]
      }
      attachments: {
        Row: {
          activity_id: string | null
          caption: string | null
          captured_at: string | null
          category: string | null
          checksum_sha256: string | null
          daily_report_id: string | null
          deleted_at: string | null
          deleted_by: string | null
          file_name: string
          file_size: number
          height: number | null
          id: string
          include_in_reports: boolean
          kind: Database["public"]["Enums"]["attachment_kind"]
          latitude: number | null
          location_description: string | null
          longitude: number | null
          mime_type: string
          occurrence_id: string | null
          organization_id: string
          project_id: string
          storage_key: string
          thumbnail_key: string | null
          title: string | null
          updated_at: string
          uploaded_at: string
          uploaded_by: string
          width: number | null
        }
        Insert: {
          activity_id?: string | null
          caption?: string | null
          captured_at?: string | null
          category?: string | null
          checksum_sha256?: string | null
          daily_report_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          file_name: string
          file_size: number
          height?: number | null
          id?: string
          include_in_reports?: boolean
          kind?: Database["public"]["Enums"]["attachment_kind"]
          latitude?: number | null
          location_description?: string | null
          longitude?: number | null
          mime_type: string
          occurrence_id?: string | null
          organization_id: string
          project_id: string
          storage_key: string
          thumbnail_key?: string | null
          title?: string | null
          updated_at?: string
          uploaded_at?: string
          uploaded_by: string
          width?: number | null
        }
        Update: {
          activity_id?: string | null
          caption?: string | null
          captured_at?: string | null
          category?: string | null
          checksum_sha256?: string | null
          daily_report_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          file_name?: string
          file_size?: number
          height?: number | null
          id?: string
          include_in_reports?: boolean
          kind?: Database["public"]["Enums"]["attachment_kind"]
          latitude?: number | null
          location_description?: string | null
          longitude?: number | null
          mime_type?: string
          occurrence_id?: string | null
          organization_id?: string
          project_id?: string
          storage_key?: string
          thumbnail_key?: string | null
          title?: string | null
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "attachments_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_daily_report_id_fkey"
            columns: ["daily_report_id"]
            isOneToOne: false
            referencedRelation: "daily_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "occurrences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          new_values: Json | null
          organization_id: string | null
          previous_values: Json | null
          project_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          new_values?: Json | null
          organization_id?: string | null
          previous_values?: Json | null
          project_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          new_values?: Json | null
          organization_id?: string | null
          previous_values?: Json | null
          project_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          active: boolean
          created_at: string
          id: string
          kind: string
          name: string
          organization_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          kind: string
          name: string
          organization_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          kind?: string
          name?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_report_activities: {
        Row: {
          activity_id: string | null
          created_at: string
          daily_report_id: string
          description: string
          execution_status: Database["public"]["Enums"]["execution_status"]
          id: string
          location: string | null
          observations: string | null
          progress_percentage: number | null
          quantity: number | null
          sort_order: number
          stage_name: string | null
          team_description: string | null
          unit: string | null
        }
        Insert: {
          activity_id?: string | null
          created_at?: string
          daily_report_id: string
          description: string
          execution_status?: Database["public"]["Enums"]["execution_status"]
          id?: string
          location?: string | null
          observations?: string | null
          progress_percentage?: number | null
          quantity?: number | null
          sort_order?: number
          stage_name?: string | null
          team_description?: string | null
          unit?: string | null
        }
        Update: {
          activity_id?: string | null
          created_at?: string
          daily_report_id?: string
          description?: string
          execution_status?: Database["public"]["Enums"]["execution_status"]
          id?: string
          location?: string | null
          observations?: string | null
          progress_percentage?: number | null
          quantity?: number | null
          sort_order?: number
          stage_name?: string | null
          team_description?: string | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_report_activities_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_report_activities_daily_report_id_fkey"
            columns: ["daily_report_id"]
            isOneToOne: false
            referencedRelation: "daily_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_report_approvals: {
        Row: {
          comments: string | null
          daily_report_id: string
          decided_at: string
          decision: Database["public"]["Enums"]["approval_decision"]
          id: string
          reviewer_user_id: string
          version: number
        }
        Insert: {
          comments?: string | null
          daily_report_id: string
          decided_at?: string
          decision: Database["public"]["Enums"]["approval_decision"]
          id?: string
          reviewer_user_id: string
          version: number
        }
        Update: {
          comments?: string | null
          daily_report_id?: string
          decided_at?: string
          decision?: Database["public"]["Enums"]["approval_decision"]
          id?: string
          reviewer_user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "daily_report_approvals_daily_report_id_fkey"
            columns: ["daily_report_id"]
            isOneToOne: false
            referencedRelation: "daily_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_report_approvals_reviewer_user_id_fkey"
            columns: ["reviewer_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_report_crews: {
        Row: {
          absent_quantity: number
          activity_id: string | null
          company_name: string | null
          created_at: string
          daily_report_id: string
          id: string
          job_title: string
          observations: string | null
          quantity: number
        }
        Insert: {
          absent_quantity?: number
          activity_id?: string | null
          company_name?: string | null
          created_at?: string
          daily_report_id: string
          id?: string
          job_title: string
          observations?: string | null
          quantity: number
        }
        Update: {
          absent_quantity?: number
          activity_id?: string | null
          company_name?: string | null
          created_at?: string
          daily_report_id?: string
          id?: string
          job_title?: string
          observations?: string | null
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "daily_report_crews_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_report_crews_daily_report_id_fkey"
            columns: ["daily_report_id"]
            isOneToOne: false
            referencedRelation: "daily_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_report_equipment: {
        Row: {
          created_at: string
          daily_report_id: string
          equipment_id: string
          hours_used: number | null
          id: string
          observations: string | null
          usage_status: Database["public"]["Enums"]["equipment_usage"]
        }
        Insert: {
          created_at?: string
          daily_report_id: string
          equipment_id: string
          hours_used?: number | null
          id?: string
          observations?: string | null
          usage_status?: Database["public"]["Enums"]["equipment_usage"]
        }
        Update: {
          created_at?: string
          daily_report_id?: string
          equipment_id?: string
          hours_used?: number | null
          id?: string
          observations?: string | null
          usage_status?: Database["public"]["Enums"]["equipment_usage"]
        }
        Relationships: [
          {
            foreignKeyName: "daily_report_equipment_daily_report_id_fkey"
            columns: ["daily_report_id"]
            isOneToOne: false
            referencedRelation: "daily_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_report_equipment_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_report_materials: {
        Row: {
          created_at: string
          daily_report_id: string
          id: string
          invoice_number: string | null
          material_id: string
          observations: string | null
          quantity_received: number
          quantity_used: number
          shortage: boolean
          supplier_name: string | null
        }
        Insert: {
          created_at?: string
          daily_report_id: string
          id?: string
          invoice_number?: string | null
          material_id: string
          observations?: string | null
          quantity_received?: number
          quantity_used?: number
          shortage?: boolean
          supplier_name?: string | null
        }
        Update: {
          created_at?: string
          daily_report_id?: string
          id?: string
          invoice_number?: string | null
          material_id?: string
          observations?: string | null
          quantity_received?: number
          quantity_used?: number
          shortage?: boolean
          supplier_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_report_materials_daily_report_id_fkey"
            columns: ["daily_report_id"]
            isOneToOne: false
            referencedRelation: "daily_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_report_materials_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_report_versions: {
        Row: {
          created_at: string
          created_by: string | null
          daily_report_id: string
          id: string
          reason: string | null
          snapshot: Json
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          daily_report_id: string
          id?: string
          reason?: string | null
          snapshot: Json
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          daily_report_id?: string
          id?: string
          reason?: string | null
          snapshot?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "daily_report_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_report_versions_daily_report_id_fkey"
            columns: ["daily_report_id"]
            isOneToOne: false
            referencedRelation: "daily_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_report_workers: {
        Row: {
          activity_id: string | null
          attendance_status: Database["public"]["Enums"]["attendance_status"]
          company_name: string | null
          created_at: string
          daily_report_id: string
          hours_worked: number | null
          id: string
          job_title: string | null
          observations: string | null
          worker_id: string
        }
        Insert: {
          activity_id?: string | null
          attendance_status?: Database["public"]["Enums"]["attendance_status"]
          company_name?: string | null
          created_at?: string
          daily_report_id: string
          hours_worked?: number | null
          id?: string
          job_title?: string | null
          observations?: string | null
          worker_id: string
        }
        Update: {
          activity_id?: string | null
          attendance_status?: Database["public"]["Enums"]["attendance_status"]
          company_name?: string | null
          created_at?: string
          daily_report_id?: string
          hours_worked?: number | null
          id?: string
          job_title?: string | null
          observations?: string | null
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_report_workers_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_report_workers_daily_report_id_fkey"
            columns: ["daily_report_id"]
            isOneToOne: false
            referencedRelation: "daily_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_report_workers_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_reports: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          author_user_id: string
          created_at: string
          end_time: string | null
          final_notes: string | null
          general_summary: string | null
          id: string
          kind: Database["public"]["Enums"]["report_kind"]
          next_day_plan: string | null
          no_execution_reason: string | null
          pending_items: string | null
          project_id: string
          report_date: string
          returned_reason: string | null
          row_version: number
          start_time: string | null
          status: Database["public"]["Enums"]["report_status"]
          submitted_at: string | null
          technical_notes: string | null
          temperature_c: number | null
          updated_at: string
          version: number
          weather: Database["public"]["Enums"]["weather_condition"] | null
          weather_afternoon:
            | Database["public"]["Enums"]["weather_condition"]
            | null
          weather_impact: string | null
          weather_notes: string | null
          work_conditions: Database["public"]["Enums"]["work_condition"] | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          author_user_id: string
          created_at?: string
          end_time?: string | null
          final_notes?: string | null
          general_summary?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["report_kind"]
          next_day_plan?: string | null
          no_execution_reason?: string | null
          pending_items?: string | null
          project_id: string
          report_date: string
          returned_reason?: string | null
          row_version?: number
          start_time?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          submitted_at?: string | null
          technical_notes?: string | null
          temperature_c?: number | null
          updated_at?: string
          version?: number
          weather?: Database["public"]["Enums"]["weather_condition"] | null
          weather_afternoon?:
            | Database["public"]["Enums"]["weather_condition"]
            | null
          weather_impact?: string | null
          weather_notes?: string | null
          work_conditions?: Database["public"]["Enums"]["work_condition"] | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          author_user_id?: string
          created_at?: string
          end_time?: string | null
          final_notes?: string | null
          general_summary?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["report_kind"]
          next_day_plan?: string | null
          no_execution_reason?: string | null
          pending_items?: string | null
          project_id?: string
          report_date?: string
          returned_reason?: string | null
          row_version?: number
          start_time?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          submitted_at?: string | null
          technical_notes?: string | null
          temperature_c?: number | null
          updated_at?: string
          version?: number
          weather?: Database["public"]["Enums"]["weather_condition"] | null
          weather_afternoon?:
            | Database["public"]["Enums"]["weather_condition"]
            | null
          weather_impact?: string | null
          weather_notes?: string | null
          work_conditions?: Database["public"]["Enums"]["work_condition"] | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_reports_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_reports_author_user_id_fkey"
            columns: ["author_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_reports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          identification_code: string | null
          name: string
          organization_id: string
          status: Database["public"]["Enums"]["record_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          identification_code?: string | null
          name: string
          organization_id: string
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          identification_code?: string | null
          name?: string
          organization_id?: string
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_allocations: {
        Row: {
          condition: Database["public"]["Enums"]["equipment_usage"]
          created_at: string
          created_by: string | null
          end_date: string | null
          equipment_id: string
          id: string
          notes: string | null
          project_id: string
          responsible_user_id: string | null
          start_date: string
          updated_at: string
        }
        Insert: {
          condition?: Database["public"]["Enums"]["equipment_usage"]
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          equipment_id: string
          id?: string
          notes?: string | null
          project_id: string
          responsible_user_id?: string | null
          start_date: string
          updated_at?: string
        }
        Update: {
          condition?: Database["public"]["Enums"]["equipment_usage"]
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          equipment_id?: string
          id?: string
          notes?: string | null
          project_id?: string
          responsible_user_id?: string | null
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_allocations_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_allocations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_allocations_responsible_user_id_fkey"
            columns: ["responsible_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      materials: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          organization_id: string
          status: Database["public"]["Enums"]["record_status"]
          unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          organization_id: string
          status?: Database["public"]["Enums"]["record_status"]
          unit: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          organization_id?: string
          status?: Database["public"]["Enums"]["record_status"]
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "materials_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          dedupe_key: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          link: string | null
          message: string
          organization_id: string
          project_id: string | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dedupe_key?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          link?: string | null
          message: string
          organization_id: string
          project_id?: string | null
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          dedupe_key?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          link?: string | null
          message?: string
          organization_id?: string
          project_id?: string | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      occurrence_comments: {
        Row: {
          body: string
          created_at: string
          id: string
          occurrence_id: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          occurrence_id: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          occurrence_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "occurrence_comments_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "occurrences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "occurrence_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      occurrence_history: {
        Row: {
          action: string
          created_at: string
          id: string
          new_values: Json | null
          occurrence_id: string
          previous_values: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          new_values?: Json | null
          occurrence_id: string
          previous_values?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          new_values?: Json | null
          occurrence_id?: string
          previous_values?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "occurrence_history_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "occurrences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "occurrence_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      occurrences: {
        Row: {
          actions_taken: string | null
          activity_id: string | null
          category: string
          closed_at: string | null
          code: string
          created_at: string
          created_by: string
          daily_report_id: string | null
          decision: string | null
          description: string
          due_date: string | null
          id: string
          occurred_at: string
          priority: Database["public"]["Enums"]["priority_level"]
          project_id: string
          resolution_description: string | null
          resolved_at: string | null
          responsible_user_id: string | null
          row_version: number
          status: Database["public"]["Enums"]["occurrence_status"]
          title: string
          updated_at: string
        }
        Insert: {
          actions_taken?: string | null
          activity_id?: string | null
          category: string
          closed_at?: string | null
          code: string
          created_at?: string
          created_by: string
          daily_report_id?: string | null
          decision?: string | null
          description: string
          due_date?: string | null
          id?: string
          occurred_at?: string
          priority?: Database["public"]["Enums"]["priority_level"]
          project_id: string
          resolution_description?: string | null
          resolved_at?: string | null
          responsible_user_id?: string | null
          row_version?: number
          status?: Database["public"]["Enums"]["occurrence_status"]
          title: string
          updated_at?: string
        }
        Update: {
          actions_taken?: string | null
          activity_id?: string | null
          category?: string
          closed_at?: string | null
          code?: string
          created_at?: string
          created_by?: string
          daily_report_id?: string | null
          decision?: string | null
          description?: string
          due_date?: string | null
          id?: string
          occurred_at?: string
          priority?: Database["public"]["Enums"]["priority_level"]
          project_id?: string
          resolution_description?: string | null
          resolved_at?: string | null
          responsible_user_id?: string | null
          row_version?: number
          status?: Database["public"]["Enums"]["occurrence_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "occurrences_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "occurrences_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "occurrences_daily_report_id_fkey"
            columns: ["daily_report_id"]
            isOneToOne: false
            referencedRelation: "daily_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "occurrences_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "occurrences_responsible_user_id_fkey"
            columns: ["responsible_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      org_settings: {
        Row: {
          allow_complementary_reports: boolean
          due_soon_days: number
          engineer_can_approve: boolean
          max_document_mb: number
          max_image_mb: number
          organization_id: string
          stale_project_days: number
          updated_at: string
        }
        Insert: {
          allow_complementary_reports?: boolean
          due_soon_days?: number
          engineer_can_approve?: boolean
          max_document_mb?: number
          max_image_mb?: number
          organization_id: string
          stale_project_days?: number
          updated_at?: string
        }
        Update: {
          allow_complementary_reports?: boolean
          due_soon_days?: number
          engineer_can_approve?: boolean
          max_document_mb?: number
          max_image_mb?: number
          organization_id?: string
          stale_project_days?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["org_role"]
          status: Database["public"]["Enums"]["member_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id: string
          role?: Database["public"]["Enums"]["org_role"]
          status?: Database["public"]["Enums"]["member_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          status?: Database["public"]["Enums"]["member_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          contact_information: Json
          created_at: string
          created_by: string | null
          document_number: string | null
          id: string
          logo_storage_key: string | null
          name: string
          updated_at: string
        }
        Insert: {
          contact_information?: Json
          created_at?: string
          created_by?: string | null
          document_number?: string | null
          id?: string
          logo_storage_key?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          contact_information?: Json
          created_at?: string
          created_by?: string | null
          document_number?: string | null
          id?: string
          logo_storage_key?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          must_change_password: boolean
          name: string
          status: Database["public"]["Enums"]["member_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          must_change_password?: boolean
          name?: string
          status?: Database["public"]["Enums"]["member_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          must_change_password?: boolean
          name?: string
          status?: Database["public"]["Enums"]["member_status"]
          updated_at?: string
        }
        Relationships: []
      }
      project_counters: {
        Row: {
          kind: string
          last_value: number
          project_id: string
        }
        Insert: {
          kind: string
          last_value?: number
          project_id: string
        }
        Update: {
          kind?: string
          last_value?: number
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_counters_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_documents: {
        Row: {
          category: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          file_name: string
          file_size: number
          id: string
          mime_type: string
          project_id: string
          storage_key: string
          uploaded_by: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          file_name: string
          file_size: number
          id?: string
          mime_type: string
          project_id: string
          storage_key: string
          uploaded_by: string
        }
        Update: {
          category?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          file_name?: string
          file_size?: number
          id?: string
          mime_type?: string
          project_id?: string
          storage_key?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_documents_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          permissions: Json
          project_id: string
          role: Database["public"]["Enums"]["project_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          permissions?: Json
          project_id: string
          role: Database["public"]["Enums"]["project_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          permissions?: Json
          project_id?: string
          role?: Database["public"]["Enums"]["project_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      project_stages: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          project_id: string
          sequence: number
          status: Database["public"]["Enums"]["activity_status"]
          updated_at: string
          weight: number
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          project_id: string
          sequence?: number
          status?: Database["public"]["Enums"]["activity_status"]
          updated_at?: string
          weight?: number
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          sequence?: number
          status?: Database["public"]["Enums"]["activity_status"]
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_stages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          actual_end_date: string | null
          address: string | null
          archived_at: string | null
          archived_by: string | null
          city: string | null
          client_document: string | null
          client_name: string
          code: string
          cover_storage_key: string | null
          created_at: string
          created_by: string | null
          description: string | null
          expected_end_date: string | null
          general_notes: string | null
          id: string
          name: string
          organization_id: string
          progress_method: Database["public"]["Enums"]["progress_method"]
          progress_percentage: number
          row_version: number
          start_date: string | null
          state: string | null
          status: Database["public"]["Enums"]["project_status"]
          technical_registration: string | null
          technical_responsible: string | null
          updated_at: string
        }
        Insert: {
          actual_end_date?: string | null
          address?: string | null
          archived_at?: string | null
          archived_by?: string | null
          city?: string | null
          client_document?: string | null
          client_name: string
          code: string
          cover_storage_key?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          expected_end_date?: string | null
          general_notes?: string | null
          id?: string
          name: string
          organization_id: string
          progress_method?: Database["public"]["Enums"]["progress_method"]
          progress_percentage?: number
          row_version?: number
          start_date?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          technical_registration?: string | null
          technical_responsible?: string | null
          updated_at?: string
        }
        Update: {
          actual_end_date?: string | null
          address?: string | null
          archived_at?: string | null
          archived_by?: string | null
          city?: string | null
          client_document?: string | null
          client_name?: string
          code?: string
          cover_storage_key?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          expected_end_date?: string | null
          general_notes?: string | null
          id?: string
          name?: string
          organization_id?: string
          progress_method?: Database["public"]["Enums"]["progress_method"]
          progress_percentage?: number
          row_version?: number
          start_date?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          technical_registration?: string | null
          technical_responsible?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          name: string
          organization_id: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          name: string
          organization_id: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "units_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_projects: {
        Row: {
          created_at: string
          project_id: string
          worker_id: string
        }
        Insert: {
          created_at?: string
          project_id: string
          worker_id: string
        }
        Update: {
          created_at?: string
          project_id?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_projects_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      workers: {
        Row: {
          company_name: string | null
          contact_information: string | null
          created_at: string
          created_by: string | null
          id: string
          job_title: string
          name: string
          organization_id: string
          status: Database["public"]["Enums"]["record_status"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          company_name?: string | null
          contact_information?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          job_title: string
          name: string
          organization_id: string
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          company_name?: string | null
          contact_information?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          job_title?: string
          name?: string
          organization_id?: string
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_pending_invites: { Args: never; Returns: number }
      approve_daily_report: {
        Args: { p_comments?: string; p_report: string; p_row_version?: number }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          author_user_id: string
          created_at: string
          end_time: string | null
          final_notes: string | null
          general_summary: string | null
          id: string
          kind: Database["public"]["Enums"]["report_kind"]
          next_day_plan: string | null
          no_execution_reason: string | null
          pending_items: string | null
          project_id: string
          report_date: string
          returned_reason: string | null
          row_version: number
          start_time: string | null
          status: Database["public"]["Enums"]["report_status"]
          submitted_at: string | null
          technical_notes: string | null
          temperature_c: number | null
          updated_at: string
          version: number
          weather: Database["public"]["Enums"]["weather_condition"] | null
          weather_afternoon:
            | Database["public"]["Enums"]["weather_condition"]
            | null
          weather_impact: string | null
          weather_notes: string | null
          work_conditions: Database["public"]["Enums"]["work_condition"] | null
        }
        SetofOptions: {
          from: "*"
          to: "daily_reports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_organization: {
        Args: { p_document?: string; p_name: string }
        Returns: string
      }
      dashboard_summary: {
        Args: {
          p_from?: string
          p_org: string
          p_project?: string
          p_responsible?: string
          p_status?: Database["public"]["Enums"]["project_status"]
          p_to?: string
        }
        Returns: Json
      }
      mark_all_notifications_read: { Args: never; Returns: number }
      my_project_permissions: { Args: { p_project: string }; Returns: Json }
      reopen_daily_report: {
        Args: { p_reason: string; p_report: string; p_row_version?: number }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          author_user_id: string
          created_at: string
          end_time: string | null
          final_notes: string | null
          general_summary: string | null
          id: string
          kind: Database["public"]["Enums"]["report_kind"]
          next_day_plan: string | null
          no_execution_reason: string | null
          pending_items: string | null
          project_id: string
          report_date: string
          returned_reason: string | null
          row_version: number
          start_time: string | null
          status: Database["public"]["Enums"]["report_status"]
          submitted_at: string | null
          technical_notes: string | null
          temperature_c: number | null
          updated_at: string
          version: number
          weather: Database["public"]["Enums"]["weather_condition"] | null
          weather_afternoon:
            | Database["public"]["Enums"]["weather_condition"]
            | null
          weather_impact: string | null
          weather_notes: string | null
          work_conditions: Database["public"]["Enums"]["work_condition"] | null
        }
        SetofOptions: {
          from: "*"
          to: "daily_reports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      return_daily_report: {
        Args: { p_reason: string; p_report: string; p_row_version?: number }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          author_user_id: string
          created_at: string
          end_time: string | null
          final_notes: string | null
          general_summary: string | null
          id: string
          kind: Database["public"]["Enums"]["report_kind"]
          next_day_plan: string | null
          no_execution_reason: string | null
          pending_items: string | null
          project_id: string
          report_date: string
          returned_reason: string | null
          row_version: number
          start_time: string | null
          status: Database["public"]["Enums"]["report_status"]
          submitted_at: string | null
          technical_notes: string | null
          temperature_c: number | null
          updated_at: string
          version: number
          weather: Database["public"]["Enums"]["weather_condition"] | null
          weather_afternoon:
            | Database["public"]["Enums"]["weather_condition"]
            | null
          weather_impact: string | null
          weather_notes: string | null
          work_conditions: Database["public"]["Enums"]["work_condition"] | null
        }
        SetofOptions: {
          from: "*"
          to: "daily_reports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_daily_report: {
        Args: { p_report: string; p_row_version?: number }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          author_user_id: string
          created_at: string
          end_time: string | null
          final_notes: string | null
          general_summary: string | null
          id: string
          kind: Database["public"]["Enums"]["report_kind"]
          next_day_plan: string | null
          no_execution_reason: string | null
          pending_items: string | null
          project_id: string
          report_date: string
          returned_reason: string | null
          row_version: number
          start_time: string | null
          status: Database["public"]["Enums"]["report_status"]
          submitted_at: string | null
          technical_notes: string | null
          temperature_c: number | null
          updated_at: string
          version: number
          weather: Database["public"]["Enums"]["weather_condition"] | null
          weather_afternoon:
            | Database["public"]["Enums"]["weather_condition"]
            | null
          weather_impact: string | null
          weather_notes: string | null
          work_conditions: Database["public"]["Enums"]["work_condition"] | null
        }
        SetofOptions: {
          from: "*"
          to: "daily_reports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      activity_status:
        | "nao_iniciada"
        | "em_andamento"
        | "bloqueada"
        | "concluida"
        | "cancelada"
      approval_decision:
        | "enviado"
        | "aprovado"
        | "devolvido"
        | "reaberto_para_correcao"
      attachment_kind: "foto" | "documento"
      attendance_status:
        | "presente"
        | "falta"
        | "falta_justificada"
        | "atestado"
        | "folga"
      equipment_usage: "operando" | "parado" | "indisponivel" | "com_defeito"
      execution_status: "concluida" | "em_andamento" | "nao_executada"
      member_status: "ativo" | "convidado" | "inativo"
      occurrence_status:
        | "aberta"
        | "em_analise"
        | "em_andamento"
        | "aguardando_terceiros"
        | "resolvida"
        | "encerrada"
      org_role: "admin" | "membro"
      priority_level: "baixa" | "media" | "alta" | "critica"
      progress_method: "peso_etapa" | "peso_atividade" | "manual"
      project_role: "gestor" | "engenheiro" | "encarregado" | "colaborador"
      project_status:
        | "planejamento"
        | "nao_iniciada"
        | "em_andamento"
        | "paralisada"
        | "concluida"
        | "cancelada"
      record_status: "ativo" | "inativo"
      report_kind: "principal" | "complementar"
      report_status: "rascunho" | "enviado" | "aprovado" | "devolvido"
      weather_condition:
        | "ensolarado"
        | "nublado"
        | "chuvoso"
        | "chuva_intensa"
        | "outros"
      work_condition: "praticavel" | "parcialmente_praticavel" | "impraticavel"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      activity_status: [
        "nao_iniciada",
        "em_andamento",
        "bloqueada",
        "concluida",
        "cancelada",
      ],
      approval_decision: [
        "enviado",
        "aprovado",
        "devolvido",
        "reaberto_para_correcao",
      ],
      attachment_kind: ["foto", "documento"],
      attendance_status: [
        "presente",
        "falta",
        "falta_justificada",
        "atestado",
        "folga",
      ],
      equipment_usage: ["operando", "parado", "indisponivel", "com_defeito"],
      execution_status: ["concluida", "em_andamento", "nao_executada"],
      member_status: ["ativo", "convidado", "inativo"],
      occurrence_status: [
        "aberta",
        "em_analise",
        "em_andamento",
        "aguardando_terceiros",
        "resolvida",
        "encerrada",
      ],
      org_role: ["admin", "membro"],
      priority_level: ["baixa", "media", "alta", "critica"],
      progress_method: ["peso_etapa", "peso_atividade", "manual"],
      project_role: ["gestor", "engenheiro", "encarregado", "colaborador"],
      project_status: [
        "planejamento",
        "nao_iniciada",
        "em_andamento",
        "paralisada",
        "concluida",
        "cancelada",
      ],
      record_status: ["ativo", "inativo"],
      report_kind: ["principal", "complementar"],
      report_status: ["rascunho", "enviado", "aprovado", "devolvido"],
      weather_condition: [
        "ensolarado",
        "nublado",
        "chuvoso",
        "chuva_intensa",
        "outros",
      ],
      work_condition: ["praticavel", "parcialmente_praticavel", "impraticavel"],
    },
  },
} as const
