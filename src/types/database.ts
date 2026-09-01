export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      clan_invites: {
        Row: {
          clan_id: string
          created_at: string
          id: string
          invitee_id: string
          inviter_id: string
          status: Database["public"]["Enums"]["clan_invite_status"]
          updated_at: string
        }
        Insert: {
          clan_id: string
          created_at?: string
          id?: string
          invitee_id: string
          inviter_id: string
          status?: Database["public"]["Enums"]["clan_invite_status"]
          updated_at?: string
        }
        Update: {
          clan_id?: string
          created_at?: string
          id?: string
          invitee_id?: string
          inviter_id?: string
          status?: Database["public"]["Enums"]["clan_invite_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clan_invites_clan_id_fkey"
            columns: ["clan_id"]
            isOneToOne: false
            referencedRelation: "clans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clan_invites_invitee_id_fkey"
            columns: ["invitee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clan_invites_invitee_id_fkey"
            columns: ["invitee_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clan_invites_inviter_id_fkey"
            columns: ["inviter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clan_invites_inviter_id_fkey"
            columns: ["inviter_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clan_members: {
        Row: {
          clan_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          clan_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          clan_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clan_members_clan_id_fkey"
            columns: ["clan_id"]
            isOneToOne: false
            referencedRelation: "clans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clan_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clan_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clans: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          picture_path: string | null
          points: number
          tag: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          picture_path?: string | null
          points?: number
          tag: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          picture_path?: string | null
          points?: number
          tag?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clans_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clans_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      friend_requests: {
        Row: {
          created_at: string
          id: string
          receiver_id: string
          sender_id: string
          status: Database["public"]["Enums"]["friend_request_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          receiver_id: string
          sender_id: string
          status?: Database["public"]["Enums"]["friend_request_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          receiver_id?: string
          sender_id?: string
          status?: Database["public"]["Enums"]["friend_request_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "friend_requests_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friend_requests_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friend_requests_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friend_requests_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      maps: {
        Row: {
          created_at: string
          creator: string
          difficulty: string
          id: string
          length: string | null
          name: string
          points: number
          released_on: string | null
          stars: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          creator: string
          difficulty: string
          id?: string
          length?: string | null
          name: string
          points: number
          released_on?: string | null
          stars: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          creator?: string
          difficulty?: string
          id?: string
          length?: string | null
          name?: string
          points?: number
          released_on?: string | null
          stars?: string
          updated_at?: string
        }
        Relationships: []
      }
      nickname_change_requests: {
        Row: {
          created_at: string
          id: string
          requested_nickname: string
          status: Database["public"]["Enums"]["nickname_change_request_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          requested_nickname: string
          status?: Database["public"]["Enums"]["nickname_change_request_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          requested_nickname?: string
          status?: Database["public"]["Enums"]["nickname_change_request_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nickname_change_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nickname_change_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      player_label_assignments: {
        Row: {
          created_at: string
          label_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          label_id: string
          profile_id: string
        }
        Update: {
          created_at?: string
          label_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_label_assignments_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "player_labels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_label_assignments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_label_assignments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      player_labels: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          color: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          is_banned: boolean
          is_verified: boolean
          kog_points: number | null
          kog_points_verified: boolean
          nickname: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          is_banned?: boolean
          is_verified?: boolean
          kog_points?: number | null
          kog_points_verified?: boolean
          nickname?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_banned?: boolean
          is_verified?: boolean
          kog_points?: number | null
          kog_points_verified?: boolean
          nickname?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      run_comment_likes: {
        Row: {
          comment_id: string
          created_at: string
          run_id: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          run_id: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          run_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "run_comment_likes_comment_run_fkey"
            columns: ["comment_id", "run_id"]
            isOneToOne: false
            referencedRelation: "run_comments"
            referencedColumns: ["id", "run_id"]
          },
          {
            foreignKeyName: "run_comment_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "run_comment_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      run_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          run_id: string
          screenshot_path: string | null
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          run_id: string
          screenshot_path?: string | null
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          run_id?: string
          screenshot_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "run_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "run_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "run_comments_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      run_invites: {
        Row: {
          created_at: string
          run_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          run_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          run_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "run_invites_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "run_invites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "run_invites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      run_participants: {
        Row: {
          created_at: string
          id: string
          run_id: string
          status: Database["public"]["Enums"]["participant_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          run_id: string
          status?: Database["public"]["Enums"]["participant_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          run_id?: string
          status?: Database["public"]["Enums"]["participant_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "run_participants_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "run_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "run_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      runs: {
        Row: {
          archived_at: string | null
          auto_join_min: number | null
          completed_at: string | null
          created_at: string
          extended_until: string | null
          id: string
          join_mode: Database["public"]["Enums"]["join_mode"]
          map_category: string | null
          map_id: string | null
          max_participants: number
          min_points: number
          organizer_id: string
          starts_at: string
          title: string | null
          updated_at: string
          verified_at: string | null
          visibility: Database["public"]["Enums"]["run_visibility"]
        }
        Insert: {
          archived_at?: string | null
          auto_join_min?: number | null
          completed_at?: string | null
          created_at?: string
          extended_until?: string | null
          id?: string
          join_mode?: Database["public"]["Enums"]["join_mode"]
          map_category?: string | null
          map_id?: string | null
          max_participants: number
          min_points?: number
          organizer_id: string
          starts_at: string
          title?: string | null
          updated_at?: string
          verified_at?: string | null
          visibility?: Database["public"]["Enums"]["run_visibility"]
        }
        Update: {
          archived_at?: string | null
          auto_join_min?: number | null
          completed_at?: string | null
          created_at?: string
          extended_until?: string | null
          id?: string
          join_mode?: Database["public"]["Enums"]["join_mode"]
          map_category?: string | null
          map_id?: string | null
          max_participants?: number
          min_points?: number
          organizer_id?: string
          starts_at?: string
          title?: string | null
          updated_at?: string
          verified_at?: string | null
          visibility?: Database["public"]["Enums"]["run_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "runs_map_id_fkey"
            columns: ["map_id"]
            isOneToOne: false
            referencedRelation: "maps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runs_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runs_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      public_friendships: {
        Row: {
          friend_id: string | null
          user_id: string | null
        }
        Relationships: []
      }
      public_profiles: {
        Row: {
          id: string | null
          is_verified: boolean | null
          kog_points: number | null
          kog_points_verified: boolean | null
          nickname: string | null
        }
        Insert: {
          id?: string | null
          is_verified?: boolean | null
          kog_points?: number | null
          kog_points_verified?: boolean | null
          nickname?: string | null
        }
        Update: {
          id?: string | null
          is_verified?: boolean | null
          kog_points?: number | null
          kog_points_verified?: boolean | null
          nickname?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      archive_run: { Args: { p_run_id: string }; Returns: string }
      are_friends: { Args: { a: string; b: string }; Returns: boolean }
      auto_join_run: { Args: { p_run_id: string }; Returns: string }
      can_view_run: { Args: { p_run_id: string }; Returns: boolean }
      comment_screenshot_object_run_id: {
        Args: { p_name: string }
        Returns: string
      }
      complete_clan_run: { Args: { p_run_id: string }; Returns: string }
      create_invite_only_run: {
        Args: {
          p_auto_join_min?: number
          p_invitee_ids: string[]
          p_join_mode: Database["public"]["Enums"]["join_mode"]
          p_map_category: string
          p_map_id: string
          p_max_participants: number
          p_min_points: number
          p_starts_at: string
          p_title: string
        }
        Returns: string
      }
      ensure_own_profile: {
        Args: never
        Returns: {
          created_at: string
          id: string
          is_banned: boolean
          is_verified: boolean
          kog_points: number | null
          kog_points_verified: boolean
          nickname: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      extend_run: {
        Args: { p_hours: number; p_run_id: string }
        Returns: string
      }
      is_admin: { Args: never; Returns: boolean }
      is_confirmed_participant: { Args: { p_run_id: string }; Returns: boolean }
      is_not_banned: { Args: never; Returns: boolean }
      is_run_active_row: {
        Args: { p_archived_at: string; p_extended_until: string }
        Returns: boolean
      }
      is_run_in_active_window: { Args: { p_run_id: string }; Returns: boolean }
      is_run_invitee: { Args: { p_run_id: string }; Returns: boolean }
      is_run_organizer: { Args: { p_run_id: string }; Returns: boolean }
      is_run_roster_open_row: {
        Args: {
          p_archived_at: string
          p_completed_at: string
          p_extended_until: string
        }
        Returns: boolean
      }
      is_same_clan: { Args: { a: string; b: string }; Returns: boolean }
      list_player_public_runs: {
        Args: { p_user_id: string }
        Returns: {
          archived_at: string
          confirmed_count: number
          created_at: string
          extended_until: string
          id: string
          join_mode: Database["public"]["Enums"]["join_mode"]
          map_category: string
          map_creator: string
          map_difficulty: string
          map_id: string
          map_length: string
          map_name: string
          map_points: number
          map_released_on: string
          map_stars: string
          max_participants: number
          min_points: number
          organizer_id: string
          organizer_nickname: string
          starts_at: string
          title: string
          visibility: Database["public"]["Enums"]["run_visibility"]
        }[]
      }
      set_run_visibility_and_invites: {
        Args: {
          p_auto_join_min?: number
          p_invitee_ids: string[]
          p_join_mode?: Database["public"]["Enums"]["join_mode"]
          p_map_category: string
          p_map_id: string
          p_max_participants: number
          p_min_points: number
          p_run_id: string
          p_starts_at: string
          p_title: string
          p_update_auto_join_min?: boolean
          p_visibility: Database["public"]["Enums"]["run_visibility"]
        }
        Returns: undefined
      }
      verify_clan_run_finish: { Args: { p_run_id: string }; Returns: string }
    }
    Enums: {
      clan_invite_status: "pending" | "declined"
      friend_request_status: "pending" | "accepted" | "declined"
      join_mode: "approval_required" | "auto_join"
      nickname_change_request_status: "pending" | "accepted" | "denied"
      participant_status: "pending" | "confirmed" | "denied"
      run_visibility: "public" | "friends_only" | "invite_only" | "clan_only"
      user_role: "member" | "admin"
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
    Enums: {
      clan_invite_status: ["pending", "declined"],
      friend_request_status: ["pending", "accepted", "declined"],
      join_mode: ["approval_required", "auto_join"],
      nickname_change_request_status: ["pending", "accepted", "denied"],
      participant_status: ["pending", "confirmed", "denied"],
      run_visibility: ["public", "friends_only", "invite_only", "clan_only"],
      user_role: ["member", "admin"],
    },
  },
} as const

